import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pauseEmailQueue, resumeEmailQueue, isEmailQueuePaused, getQueueJobCounts, getCampaignSendQueue } from '../services/queues';
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

export default router;
