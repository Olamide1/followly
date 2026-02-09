import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pauseEmailQueue, resumeEmailQueue, isEmailQueuePaused, getQueueJobCounts, getCampaignSendQueue } from '../services/queues';
import { CircuitBreakerService } from '../services/circuitBreaker';
import { pool } from '../database/connection';

const router = Router();
router.use(authenticateToken);

/**
 * Pause email queue - stops processing new emails immediately
 * POST /api/admin/queue/pause
 */
router.post('/queue/pause', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await pauseEmailQueue();
    const paused = await isEmailQueuePaused();
    res.json({ 
      success: true, 
      paused,
      message: 'Email queue paused. No new emails will be processed.' 
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Resume email queue - resumes processing emails
 * POST /api/admin/queue/resume
 */
router.post('/queue/resume', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await resumeEmailQueue();
    const paused = await isEmailQueuePaused();
    res.json({ 
      success: true, 
      paused,
      message: 'Email queue resumed. Emails will be processed.' 
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Get email queue status (Bull queues + database)
 * GET /api/admin/queue/status
 */
router.get('/queue/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const paused = await isEmailQueuePaused();
    const jobCounts = await getQueueJobCounts();
    
    // Also check database for pending/queued/sending emails
    const dbStatus = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE status IN ('pending', 'queued', 'sending')
       GROUP BY status`
    );
    
    const dbCounts: Record<string, number> = {};
    dbStatus.rows.forEach((row: any) => {
      dbCounts[row.status] = parseInt(row.count);
    });
    
    res.json({ 
      paused,
      message: paused ? 'Email queue is paused' : 'Email queue is active',
      queues: jobCounts,
      database: {
        pending: dbCounts.pending || 0,
        queued: dbCounts.queued || 0,
        sending: dbCounts.sending || 0,
        totalPending: (dbCounts.pending || 0) + (dbCounts.queued || 0) + (dbCounts.sending || 0),
      },
      summary: {
        totalWaiting: jobCounts.email.waiting + jobCounts.campaignSend.waiting + jobCounts.scheduling.waiting + jobCounts.contactImport.waiting,
        totalActive: jobCounts.email.active + jobCounts.campaignSend.active + jobCounts.scheduling.active + jobCounts.contactImport.active,
        totalFailed: jobCounts.email.failed + jobCounts.campaignSend.failed + jobCounts.scheduling.failed + jobCounts.contactImport.failed,
        totalDelayed: jobCounts.email.delayed + jobCounts.campaignSend.delayed + jobCounts.scheduling.delayed + jobCounts.contactImport.delayed,
      }
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Get current warmup schedule status for user's domains
 * GET /api/admin/warmup/status
 */
router.get('/warmup/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { WarmupService } = await import('../services/warmup');
    const warmupService = new WarmupService();
    
    // Get all active providers for this user
    const providers = await pool.query(
      `SELECT DISTINCT 
        SUBSTRING(from_email FROM '@(.*)$')::text as domain,
        provider
       FROM provider_configs
       WHERE user_id = $1 AND is_active = true AND from_email IS NOT NULL`,
      [userId]
    );
    
    const warmupStatuses = await Promise.all(
      providers.rows.map(async (row: any) => {
        const schedule = await warmupService.getWarmupSchedule(userId, row.domain, row.provider);
        const dailyLimit = schedule ? await warmupService.getDailyLimit(userId, row.domain, row.provider) : null;
        
        // Calculate hourly limit based on current calculation
        const hourlyLimit = dailyLimit ? Math.max(2, Math.floor(dailyLimit / 12)) : null;
        
        return {
          domain: row.domain,
          provider: row.provider,
          inWarmup: !!schedule,
          phase: schedule?.phase || null,
          dailyLimit: dailyLimit,
          hourlyLimit: hourlyLimit,
          currentCount: schedule?.current_count || 0,
          remainingToday: dailyLimit ? Math.max(0, dailyLimit - (schedule?.current_count || 0)) : null,
          startDate: schedule?.start_date || null,
          status: schedule?.status || null,
        };
      })
    );
    
    res.json({
      warmupSchedules: warmupStatuses,
      summary: {
        totalDomains: warmupStatuses.length,
        domainsInWarmup: warmupStatuses.filter(s => s.inWarmup).length,
        totalRemainingToday: warmupStatuses.reduce((sum, s) => sum + (s.remainingToday || 0), 0),
      },
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Temporarily increase warmup limit for urgent sends (keeps warmup active, auto-monitors)
 * POST /api/admin/warmup/increase-limit
 * Body: { domain: string, provider: string, dailyLimit: number, temporary?: boolean, revertAfterDays?: number }
 */
router.post('/warmup/increase-limit', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { domain, provider, dailyLimit, temporary, revertAfterDays } = req.body;
    
    if (!domain || !provider || dailyLimit === undefined) {
      return res.status(400).json({ error: 'domain, provider, and dailyLimit are required' });
    }
    
    if (dailyLimit < 0 || dailyLimit > 2000) {
      return res.status(400).json({ error: 'dailyLimit must be between 0 and 2000' });
    }
    
    const { WarmupService } = await import('../services/warmup');
    const warmupService = new WarmupService();
    
    // Get or create warmup schedule
    let schedule = await warmupService.getWarmupSchedule(userId, domain, provider);
    if (!schedule) {
      await warmupService.ensureWarmupSchedule(userId, domain, provider);
      schedule = await warmupService.getWarmupSchedule(userId, domain, provider);
    }
    
    if (!schedule) {
      return res.status(404).json({ error: 'Warmup schedule not found' });
    }
    
    // If temporary, use the temporary increase method
    if (temporary) {
      const days = revertAfterDays || 7;
      await warmupService.setTemporaryIncrease(userId, domain, provider, dailyLimit, days);
      
      const revertDate = new Date();
      revertDate.setDate(revertDate.getDate() + days);
      
      const newHourlyLimit = Math.max(2, Math.floor(dailyLimit / 12));
      
      return res.json({
        success: true,
        message: `Temporary warmup limit set for ${domain} (${provider})`,
        domain,
        provider,
        newDailyLimit: dailyLimit,
        newHourlyLimit,
        temporary: true,
        revertsOn: revertDate.toISOString(),
        warning: 'Warmup monitoring is still active. Limits will auto-reduce if bounce/complaint rates spike.',
      });
    }
    
    // Permanent increase (still keeps warmup active)
    await pool.query(
      'UPDATE warmup_schedules SET daily_limit = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [dailyLimit, schedule.id]
    );
    
    const newHourlyLimit = Math.max(2, Math.floor(dailyLimit / 12));
    
    res.json({
      success: true,
      message: `Warmup limit updated for ${domain} (${provider})`,
      domain,
      provider,
      newDailyLimit: dailyLimit,
      newHourlyLimit,
      temporary: false,
      warning: dailyLimit > 500 
        ? 'High limit set - warmup monitoring is still active and will auto-reduce if bounce/complaint rates spike' 
        : 'Warmup monitoring is still active to protect your domain reputation',
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Fast-track warmup to Phase 3 (500/day) - safer middle ground
 * POST /api/admin/warmup/fast-track
 * Body: { domain: string, provider: string }
 */
router.post('/warmup/fast-track', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { domain, provider } = req.body;
    
    if (!domain || !provider) {
      return res.status(400).json({ error: 'domain and provider are required' });
    }
    
    const { WarmupService } = await import('../services/warmup');
    const warmupService = new WarmupService();
    
    await warmupService.fastTrackWarmup(userId, domain, provider);
    
    const hourlyLimit = Math.max(2, Math.floor(500 / 12)); // ~41/hour
    
    res.json({
      success: true,
      message: `Warmup fast-tracked to Phase 3 (500/day) for ${domain} (${provider})`,
      domain,
      provider,
      newDailyLimit: 500,
      newHourlyLimit: hourlyLimit,
      phase: 3,
      warning: 'Warmup monitoring is still active. System will auto-reduce limits if bounce/complaint rates exceed safe thresholds.',
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Complete warmup early (removes warmup restrictions) - USE WITH CAUTION
 * POST /api/admin/warmup/complete
 * Body: { domain: string, provider: string, confirm: boolean }
 */
router.post('/warmup/complete', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { domain, provider, confirm } = req.body;
    
    if (!domain || !provider) {
      return res.status(400).json({ error: 'domain and provider are required' });
    }
    
    if (confirm !== true) {
      return res.status(400).json({ 
        error: 'Must confirm by setting confirm: true',
        warning: 'Completing warmup removes all protections. Only do this if your domain is well-established and you understand the risks.',
        recommendation: 'Consider using /warmup/fast-track instead for safer increased limits',
      });
    }
    
    const { WarmupService } = await import('../services/warmup');
    const warmupService = new WarmupService();
    
    await warmupService.completeWarmup(userId, domain, provider);
    
    res.json({
      success: true,
      message: `Warmup completed for ${domain} (${provider}). No more warmup restrictions.`,
      domain,
      provider,
      warning: 'All warmup protections removed. Monitor your domain reputation manually.',
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Get comprehensive sending diagnostics - warmup, rate limits, queue status
 * GET /api/admin/sending/diagnostics
 */
router.get('/sending/diagnostics', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { WarmupService } = await import('../services/warmup');
    const { RateLimiterService } = await import('../services/rateLimiter');
    const { getEmailQueue, getQueueJobCounts } = await import('../services/queues');
    
    const warmupService = new WarmupService();
    const rateLimiterService = new RateLimiterService();
    
    // Get warmup status
    const providers = await pool.query(
      `SELECT DISTINCT 
        SUBSTRING(from_email FROM '@(.*)$')::text as domain,
        provider
       FROM provider_configs
       WHERE user_id = $1 AND is_active = true AND from_email IS NOT NULL`,
      [userId]
    );
    
    const warmupDetails = await Promise.all(
      providers.rows.map(async (row: any) => {
        const schedule = await warmupService.getWarmupSchedule(userId, row.domain, row.provider);
        
        // Get current rate limit status (always fetch to get dynamic limit)
        let rateLimitStatus = null;
        try {
          rateLimitStatus = await rateLimiterService.canSend(row.domain, {
            userId,
            provider: row.provider,
          });
        } catch (error: any) {
          console.error(`[Diagnostics] Error getting rate limit for ${row.domain}:`, error?.message);
        }
        
        // Calculate limits: use warmup limits if in warmup, otherwise use dynamic rate limit
        let dailyLimit: number | null = null;
        let hourlyLimit: number | null = null;
        
        if (schedule) {
          // In warmup: use warmup schedule limits
          dailyLimit = await warmupService.getDailyLimit(userId, row.domain, row.provider);
          hourlyLimit = dailyLimit ? Math.max(2, Math.floor(dailyLimit / 12)) : null;
        } else if (rateLimitStatus && rateLimitStatus.limit > 0) {
          // Warmup completed: use dynamic rate limit from RateLimiterService
          hourlyLimit = rateLimitStatus.limit;
          // Calculate daily limit from hourly (conservative: hourly * 24, but cap at reasonable max)
          dailyLimit = Math.min(hourlyLimit * 24, 10000); // Cap at 10k/day for display purposes
        }
        
        return {
          domain: row.domain,
          provider: row.provider,
          warmup: {
            inWarmup: !!schedule,
            phase: schedule?.phase || null,
            status: schedule?.status || null,
            dailyLimit: dailyLimit,
            hourlyLimit: hourlyLimit,
            currentCount: schedule?.current_count || 0,
            remainingToday: dailyLimit ? Math.max(0, dailyLimit - (schedule?.current_count || 0)) : null,
            startDate: schedule?.start_date || null,
          },
          rateLimit: rateLimitStatus,
        };
      })
    );
    
    // Get queue status
    const queueCounts = await getQueueJobCounts();
    const emailQueue = getEmailQueue();
    const emailQueueCounts = await emailQueue.getJobCounts();
    
    // Get email status from database
    const emailStatus = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1
       GROUP BY status
       ORDER BY status`,
      [userId]
    );
    
    const statusCounts: Record<string, number> = {};
    emailStatus.rows.forEach((row: any) => {
      statusCounts[row.status] = parseInt(row.count || '0');
    });
    
    // Get emails sent in last hour
    const lastHour = await pool.query(
      `SELECT COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1 
         AND status = 'sent'
         AND sent_at > NOW() - INTERVAL '1 hour'`,
      [userId]
    );
    
    const sentLastHour = parseInt(lastHour.rows[0]?.count || '0');
    
    // Get emails sent today
    const today = await pool.query(
      `SELECT COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1 
         AND status = 'sent'
         AND DATE(sent_at) = CURRENT_DATE`,
      [userId]
    );
    
    const sentToday = parseInt(today.rows[0]?.count || '0');
    
    // Get per-recipient-domain throttle status from Redis
    // Shows how many emails have been sent to each major recipient domain this hour
    let recipientDomainThrottle: Array<{ domain: string; sent: number; limit: number }> = [];
    try {
      const { getRedisClient } = await import('../services/redis');
      const redis = getRedisClient();
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];

      // Check common recipient domains for each sender domain
      const recipientDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'aol.com'];
      const recipientLimits: Record<string, number> = {
        'gmail.com': 20, 'googlemail.com': 20,
        'yahoo.com': 25,
        'outlook.com': 30, 'hotmail.com': 30, 'live.com': 30, 'aol.com': 30,
      };

      for (const provRow of providers.rows) {
        for (const recipientDomain of recipientDomains) {
          const redisKey = `recipient_rate_limit:${provRow.domain}:${recipientDomain}:${hourKey}`;
          const count = parseInt(await redis.get(redisKey) || '0', 10);
          if (count > 0) {
            recipientDomainThrottle.push({
              domain: recipientDomain,
              sent: count,
              limit: recipientLimits[recipientDomain] || 40,
            });
          }
        }
      }
    } catch (throttleError: any) {
      console.warn('[Diagnostics] Error getting recipient domain throttle data:', throttleError?.message);
    }

    res.json({
      warmup: warmupDetails,
      queue: {
        emailQueue: {
          waiting: emailQueueCounts.waiting || 0,
          active: emailQueueCounts.active || 0,
          delayed: emailQueueCounts.delayed || 0,
          failed: emailQueueCounts.failed || 0,
          completed: emailQueueCounts.completed || 0,
        },
        allQueues: queueCounts,
      },
      emails: {
        statusBreakdown: statusCounts,
        sentLastHour: sentLastHour,
        sentToday: sentToday,
        pending: (statusCounts.pending || 0) + (statusCounts.queued || 0) + (statusCounts.sending || 0),
      },
      recipientThrottle: recipientDomainThrottle,
      summary: {
        canSendMore: warmupDetails.some(d => d.warmup.remainingToday && d.warmup.remainingToday > 0),
        totalRemainingToday: warmupDetails.reduce((sum, d) => sum + (d.warmup.remainingToday || 0), 0),
        emailsWaiting: emailQueueCounts.waiting || 0,
        emailsDelayed: emailQueueCounts.delayed || 0,
        currentHourlyRate: sentLastHour,
        expectedHourlyRate: warmupDetails[0]?.warmup.hourlyLimit || null,
      },
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Get email queue diagnostics - check if emails are being processed
 * GET /api/admin/emails/diagnostics
 */
router.get('/emails/diagnostics', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { getEmailQueue, isEmailQueuePaused } = await import('../services/queues');
    
    // Check if queue is paused
    const paused = await isEmailQueuePaused();
    
    // Get queue job counts
    let queueCounts = null;
    try {
      const emailQueue = getEmailQueue();
      queueCounts = await emailQueue.getJobCounts();
    } catch (error: any) {
      console.error('Could not get queue counts:', error);
    }
    
    // Get email status breakdown from database
    const statusResult = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1
       GROUP BY status
       ORDER BY status`,
      [userId]
    );
    
    const statusCounts: Record<string, number> = {};
    statusResult.rows.forEach((row: any) => {
      statusCounts[row.status] = parseInt(row.count || '0');
    });
    
    // Get recent email activity (last hour)
    const recentActivity = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1 
         AND (sent_at > NOW() - INTERVAL '1 hour' OR created_at > NOW() - INTERVAL '1 hour')
       GROUP BY status`,
      [userId]
    );
    
    const recentCounts: Record<string, number> = {};
    recentActivity.rows.forEach((row: any) => {
      recentCounts[row.status] = parseInt(row.count || '0');
    });
    
    // Get campaigns in sending state
    const sendingCampaigns = await pool.query(
      `SELECT 
        id,
        name,
        status,
        created_at,
        updated_at
       FROM campaigns
       WHERE user_id = $1 AND status = 'sending'
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({
      queuePaused: paused,
      queueCounts,
      emailStatusCounts: statusCounts,
      recentActivity: recentCounts,
      sendingCampaigns: sendingCampaigns.rows,
      diagnostics: {
        totalEmails: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        pendingEmails: (statusCounts.pending || 0) + (statusCounts.queued || 0) + (statusCounts.sending || 0),
        sentEmails: statusCounts.sent || 0,
        failedEmails: statusCounts.failed || 0,
        queueActive: !paused && queueCounts && (queueCounts.waiting > 0 || queueCounts.active > 0),
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Get pending emails from database (works without Bull queue access)
 * GET /api/admin/emails/pending
 */
router.get('/emails/pending', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    
    // Check for pending/queued/sending emails in database
    const result = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1 AND status IN ('pending', 'queued', 'sending')
       GROUP BY status`,
      [userId]
    );
    
    // Also check for campaigns that are in "sending" status
    const campaignsResult = await pool.query(
      `SELECT 
        id,
        name,
        status,
        created_at
       FROM campaigns
       WHERE user_id = $1 AND status = 'sending'
       ORDER BY created_at DESC`,
      [userId]
    );
    
    const counts: Record<string, number> = {};
    result.rows.forEach((row: any) => {
      counts[row.status] = parseInt(row.count);
    });
    
    const totalPending = (counts.pending || 0) + (counts.queued || 0) + (counts.sending || 0);
    
    res.json({
      pending: counts.pending || 0,
      queued: counts.queued || 0,
      sending: counts.sending || 0,
      totalPending,
      hasPendingEmails: totalPending > 0,
      campaignsSending: campaignsResult.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Get failed campaign send jobs with error details
 * GET /api/admin/campaign-send/failed
 */
router.get('/campaign-send/failed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignSendQueue = getCampaignSendQueue();
    if (!campaignSendQueue) {
      return res.status(500).json({ error: 'Campaign send queue not initialized' });
    }

    // Get failed jobs (limit to last 10 for performance)
    const failedJobs = await campaignSendQueue.getFailed(0, 10);
    
    const failedJobsDetails = await Promise.all(
      failedJobs.map(async (job) => {
        try {
          const state = await job.getState();
          const failedReason = await job.failedReason;
          const stacktrace = await job.stacktrace;
          
          return {
            id: job.id,
            name: job.name,
            data: job.data,
            state,
            failedReason: failedReason || 'No reason provided',
            stacktrace: stacktrace || 'No stacktrace',
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
          };
        } catch (error: any) {
          return {
            id: job.id,
            error: `Failed to get job details: ${error?.message || error}`,
          };
        }
      })
    );

    res.json({
      count: failedJobs.length,
      jobs: failedJobsDetails,
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Clean failed campaign send jobs
 * POST /api/admin/campaign-send/clean-failed
 */
router.post('/campaign-send/clean-failed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignSendQueue = getCampaignSendQueue();
    if (!campaignSendQueue) {
      return res.status(500).json({ error: 'Campaign send queue not initialized' });
    }

    // Get all failed jobs
    const failedJobs = await campaignSendQueue.getFailed(0, 1000);
    let cleaned = 0;

    for (const job of failedJobs) {
      try {
        await job.remove();
        cleaned++;
      } catch (error: any) {
        console.error(`Failed to remove job ${job.id}:`, error?.message || error);
      }
    }

    res.json({
      success: true,
      cleaned,
      message: `Removed ${cleaned} failed jobs`,
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Get circuit breaker status for a domain
 * GET /api/admin/circuit-breaker/:domain
 */
router.get('/circuit-breaker/:domain', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const domain = req.params.domain;
    const circuitBreakerService = new CircuitBreakerService();
    const status = await circuitBreakerService.getStatus(domain);
    
    res.json({
      domain,
      ...status,
    });
  } catch (error: any) {
    return next(error);
  }
});

/**
 * Reset circuit breaker for a domain (manual override)
 * POST /api/admin/circuit-breaker/:domain/reset
 */
router.post('/circuit-breaker/:domain/reset', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const domain = req.params.domain;
    const circuitBreakerService = new CircuitBreakerService();
    await circuitBreakerService.resetCircuit(domain);
    
    res.json({
      success: true,
      message: `Circuit breaker reset for domain ${domain}. Sending will resume immediately.`,
      domain,
    });
  } catch (error: any) {
    return next(error);
  }
});

export default router;
