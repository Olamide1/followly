import { Router, Response, NextFunction } from 'express';
import { pool } from '../database/connection';
import { CampaignService } from '../services/campaigns';
import { RoutingService } from '../services/routing';
import { EmailProviderService } from '../services/providers';
import { WarmupService } from '../services/warmup';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getCampaignSendQueue } from '../services/queues';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticateToken);

// Initialize services
const providerService = new EmailProviderService();
const warmupService = new WarmupService();
const routingService = new RoutingService(providerService);
const campaignService = new CampaignService(routingService, providerService, warmupService);

// Create campaign
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await campaignService.createCampaign(req.userId!, req.body);
    res.status(201).json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

// Get campaign
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await campaignService.getCampaign(req.userId!, parseInt(req.params.id));
    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

// List campaigns
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await campaignService.listCampaigns(req.userId!, {
      type: req.query.type as 'broadcast' | 'lifecycle',
      status: req.query.status as string,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Update campaign
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await campaignService.updateCampaign(req.userId!, parseInt(req.params.id), req.body);
    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

// Delete campaign
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await campaignService.deleteCampaign(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Send campaign (queues job for async processing to avoid H12 timeouts)
router.post('/:id/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const campaignId = parseInt(req.params.id);

    // Validate campaign exists and belongs to user before queuing
    const campaign = await campaignService.getCampaign(userId, campaignId);

    // Check if campaign is already sent
    if (campaign.status === 'sent') {
      res.status(400).json({ error: 'Campaign already sent' });
      return;
    }

    // If campaign is "sending", check if it's actually stuck (no emails queued)
    // This allows recovery of stuck campaigns
    if (campaign.status === 'sending') {
      const { pool } = await import('../database/connection');
      const emailCheck = await pool.query(
        `SELECT COUNT(*) as count FROM email_queue 
         WHERE campaign_id = $1 AND status IN ('pending', 'queued', 'sending')`,
        [campaignId]
      );
      const pendingCount = parseInt(emailCheck.rows[0]?.count || '0');
      
      if (pendingCount > 0) {
        // Emails are queued, campaign is actually sending
        res.status(400).json({ error: 'Campaign already sending' });
        return;
      }
      
      // No emails queued - campaign is stuck, allow retry (worker will handle reset)
      console.log(`[Campaign Send Route] Campaign ${campaignId} appears stuck (status=sending but no emails queued), allowing retry`);
    }

    // Validate list_id
    if (!campaign.list_id) {
      res.status(400).json({ error: 'Campaign must have a list assigned' });
      return;
    }

    // Get quick estimate of contact count for UI feedback
    // This is a fast query that won't cause timeout issues
    let estimatedCount = 0;
    try {
      const listService = new (await import('../services/lists')).ListService();
      const listContacts = await listService.getAllListContacts(userId, campaign.list_id);
      estimatedCount = listContacts.length;
    } catch (error: any) {
      // If we can't get count, continue anyway - worker will handle it
      console.warn(`[Campaign Send] Could not get contact count estimate: ${error.message}`);
    }

    // Update campaign status to "sending" immediately for UI feedback
    // This happens before queuing so the frontend updates right away
    const { pool } = await import('../database/connection');
    await pool.query(
      'UPDATE campaigns SET status = $1 WHERE id = $2',
      ['sending', campaignId]
    );

    // Queue the campaign send job for async processing
    const campaignSendQueue = getCampaignSendQueue();
    
    if (!campaignSendQueue) {
      console.error(`[Campaign Send Route] ERROR: Campaign send queue is null/undefined`);
      await pool.query(
        'UPDATE campaigns SET status = $1 WHERE id = $2',
        ['draft', campaignId]
      );
      throw createError('Campaign send queue is not initialized', 500);
    }
    
    console.log(`[Campaign Send Route] Attempting to queue campaign ${campaignId} send job for user ${userId}`);
    
    try {
      const jobId = `campaign-send-${campaignId}-${userId}`;
      console.log(`[Campaign Send Route] Adding job with ID: ${jobId}`);
      
      // Check if there's an existing job with this ID (might be failed)
      const existingJob = await campaignSendQueue.getJob(jobId);
      if (existingJob) {
        const existingState = await existingJob.getState();
        console.log(`[Campaign Send Route] Found existing job ${jobId} with state: ${existingState}`);
        
        // If it's failed, remove it so we can add a fresh one
        if (existingState === 'failed' || existingState === 'completed') {
          console.log(`[Campaign Send Route] Removing existing ${existingState} job ${jobId} to allow retry`);
          await existingJob.remove();
        } else if (existingState === 'active' || existingState === 'waiting') {
          console.log(`[Campaign Send Route] ⚠️ Job ${jobId} is already ${existingState}, not adding duplicate`);
          res.json({ 
            success: true,
            message: 'Campaign send job already exists and is processing.',
            jobId: existingJob.id,
            queued: 0,
          });
          return;
        }
      }
      
      let job;
      try {
        job = await campaignSendQueue.add({
          userId,
          campaignId,
        }, {
          jobId,
          attempts: 2,
        });
        console.log(`[Campaign Send Route] ✅ Successfully queued campaign ${campaignId} send job: ${job.id}`);
      } catch (addError: any) {
        console.error(`[Campaign Send Route] ❌ Error adding job to queue:`, {
          error: addError?.message || addError,
          stack: addError?.stack,
          name: addError?.name,
        });
        throw addError;
      }
      
      // Immediately check job state after adding
      try {
        const immediateState = await job.getState();
        console.log(`[Campaign Send Route] Job ${job.id} immediate state after add: ${immediateState}`);
        if (immediateState === 'failed') {
          const failedReason = await job.failedReason;
          console.error(`[Campaign Send Route] ⚠️ Job failed immediately! Reason: ${failedReason || 'Unknown'}`);
        }
      } catch (stateError: any) {
        console.warn(`[Campaign Send Route] Could not get immediate job state:`, stateError?.message || stateError);
      }
      
      // Verify job was actually added to queue
      const jobCounts = await campaignSendQueue.getJobCounts();
      console.log(`[Campaign Send Route] Queue status after adding job:`, {
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
        delayed: jobCounts.delayed,
      });
      
      // Verify job exists in Redis by trying to get it
      try {
        const jobData = await campaignSendQueue.getJob(job.id);
        if (jobData) {
          const jobState = await jobData.getState();
          console.log(`[Campaign Send Route] ✅ Verified job ${job.id} exists in Redis. State: ${jobState}`);
          
          // If job is failed, get the error details
          if (jobState === 'failed') {
            const failedReason = await jobData.failedReason;
            const stacktrace = await jobData.stacktrace;
            console.error(`[Campaign Send Route] ❌ Job ${job.id} is in FAILED state!`, {
              failedReason: failedReason || 'No reason provided',
              stacktrace: stacktrace || 'No stacktrace',
              attemptsMade: jobData.attemptsMade,
              timestamp: jobData.timestamp,
            });
            
            // Try to get the full error from the job's returnvalue
            try {
              const returnvalue = await jobData.returnvalue;
              console.error(`[Campaign Send Route] Job returnvalue:`, returnvalue);
            } catch (e) {
              // Ignore
            }
          }
        } else {
          console.error(`[Campaign Send Route] ⚠️ WARNING: Job ${job.id} was added but not found in Redis!`);
        }
      } catch (verifyError: any) {
        console.error(`[Campaign Send Route] ⚠️ Could not verify job in Redis:`, verifyError?.message || verifyError);
      }
      
      // Log Redis connection info
      try {
        const isReady = await campaignSendQueue.isReady();
        console.log(`[Campaign Send Route] Queue ready status: ${isReady}`);
      } catch (readyError: any) {
        console.error(`[Campaign Send Route] ⚠️ Could not check queue ready status:`, readyError?.message || readyError);
      }
      
      // Return immediately - the worker will process the campaign send
      res.json({ 
        success: true,
        message: 'Campaign send queued successfully. Emails will be processed in the background.',
        jobId: job.id,
        queued: estimatedCount, // Estimated count for UI display
      });
    } catch (queueError: any) {
      console.error(`[Campaign Send Route] ❌ Failed to queue campaign ${campaignId} send job:`, {
        error: queueError?.message || queueError,
        stack: queueError?.stack,
        name: queueError?.name,
      });
      // If queuing fails, reset campaign status back to draft
      await pool.query(
        'UPDATE campaigns SET status = $1 WHERE id = $2',
        ['draft', campaignId]
      );
      throw createError(`Failed to queue campaign send: ${queueError?.message || 'Unknown error'}`, 500);
    }
  } catch (error: any) {
    return next(error);
  }
});

// Get campaign stats
router.get('/:id/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await campaignService.getCampaignStats(req.userId!, parseInt(req.params.id));
    res.json({ stats });
  } catch (error: any) {
    next(error);
  }
});

// Verify campaign delivery status
router.get('/:id/verify-delivery', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const verification = await campaignService.verifyCampaignDelivery(
      req.userId!,
      parseInt(req.params.id)
    );
    res.json(verification);
  } catch (error: any) {
    next(error);
  }
});

// Get individual email statuses for a campaign
router.get('/:id/emails', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const campaignId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string; // Optional filter by status
    
    // Verify campaign belongs to user
    const campaignCheck = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );
    
    if (campaignCheck.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    // Build query
    let query = `
      SELECT 
        eq.id,
        eq.to_email,
        eq.status,
        eq.scheduled_at,
        eq.sent_at,
        eq.error_message,
        eq.retry_count,
        eq.provider,
        eq.created_at,
        c.name as contact_name,
        c.email as contact_email
      FROM email_queue eq
      LEFT JOIN contacts c ON eq.contact_id = c.id
      WHERE eq.campaign_id = $1 AND eq.user_id = $2
    `;
    const params: any[] = [campaignId, userId];
    
    if (status) {
      query += ` AND eq.status = $3`;
      params.push(status);
    }
    
    query += ` ORDER BY eq.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM email_queue
      WHERE campaign_id = $1 AND user_id = $2
    `;
    const countParams: any[] = [campaignId, userId];
    
    if (status) {
      countQuery += ` AND status = $3`;
      countParams.push(status);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.total || '0');
    
    // Get status breakdown
    const statusBreakdown = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE campaign_id = $1 AND user_id = $2
       GROUP BY status`,
      [campaignId, userId]
    );
    
    const statusCounts: Record<string, number> = {};
    statusBreakdown.rows.forEach((row: any) => {
      statusCounts[row.status] = parseInt(row.count || '0');
    });
    
    res.json({
      emails: result.rows,
      total,
      limit,
      offset,
      statusCounts,
    });
  } catch (error: any) {
    next(error);
  }
});

// Recover campaign emails (re-queue failed or missing emails)
router.post('/:id/recover', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await campaignService.recoverCampaignEmails(req.userId!, parseInt(req.params.id));
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Reset stuck campaign (manual recovery for campaigns stuck in "sending" state)
router.post('/:id/reset', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const campaignId = parseInt(req.params.id);
    const { pool } = await import('../database/connection');
    
    // Verify campaign belongs to user
    const campaign = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );
    
    if (campaign.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    
    const campaignData = campaign.rows[0];
    
    // Only reset if campaign is stuck in "sending" state
    if (campaignData.status !== 'sending') {
      res.status(400).json({ 
        error: `Campaign is not stuck. Current status: ${campaignData.status}` 
      });
      return;
    }
    
    // Check if there are actually emails queued
    const emailCheck = await pool.query(
      `SELECT COUNT(*) as count FROM email_queue 
       WHERE campaign_id = $1 AND status IN ('pending', 'queued', 'sending')`,
      [campaignId]
    );
    const pendingCount = parseInt(emailCheck.rows[0]?.count || '0');
    
    if (pendingCount > 0) {
      res.status(400).json({ 
        error: `Campaign is actively sending. ${pendingCount} emails are queued.` 
      });
      return;
    }
    
    // Reset campaign to draft
    await pool.query(
      'UPDATE campaigns SET status = $1 WHERE id = $2',
      ['draft', campaignId]
    );
    
    console.log(`[Campaign Reset] Manually reset campaign ${campaignId} (${campaignData.name}) for user ${userId}`);
    
    res.json({ 
      success: true,
      message: 'Campaign reset to draft. You can now send it again.',
      campaignId,
      previousStatus: 'sending',
      newStatus: 'draft'
    });
  } catch (error: any) {
    next(error);
  }
});

// Send test email
router.post('/test-send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { to, subject, content, from_email, from_name } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, content' });
    }

    // Load user's providers
    const userProviders = await pool.query(
      'SELECT * FROM provider_configs WHERE user_id = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1',
      [req.userId]
    );

    if (userProviders.rows.length === 0) {
      return res.status(400).json({ error: 'No email provider configured. Please add a provider in Settings.' });
    }

    const providerConfig = userProviders.rows[0];
    const providerService = new EmailProviderService();
    
    // Initialize provider
    const providerConfigObj: any = {
      provider: providerConfig.provider,
      isDefault: true,
    };

    switch (providerConfig.provider) {
      case 'brevo':
        providerConfigObj.brevo = {
          apiKey: providerConfig.api_key,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
        };
        break;
      case 'mailjet':
        providerConfigObj.mailjet = {
          apiKey: providerConfig.api_key,
          apiSecret: providerConfig.api_secret,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
        };
        break;
      case 'resend':
        providerConfigObj.resend = {
          apiKey: providerConfig.api_key,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
        };
        break;
      case 'nodemailer':
        // Validate required SMTP fields
        if (!providerConfig.smtp_host || !providerConfig.smtp_port || !providerConfig.smtp_user || !providerConfig.smtp_pass) {
          return res.status(400).json({ 
            error: 'Nodemailer provider is missing required SMTP configuration. Please update your provider settings.' 
          });
        }
        
        providerConfigObj.nodemailer = {
          host: providerConfig.smtp_host,
          port: typeof providerConfig.smtp_port === 'string' ? parseInt(providerConfig.smtp_port, 10) : providerConfig.smtp_port,
          secure: providerConfig.smtp_secure || false,
          user: providerConfig.smtp_user,
          pass: providerConfig.smtp_pass,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
          // Enable connection pooling
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          // Add DKIM if configured
          ...(providerConfig.dkim_domain && providerConfig.dkim_private_key && {
            dkim: {
              domainName: providerConfig.dkim_domain,
              keySelector: providerConfig.dkim_selector || 'default',
              privateKey: providerConfig.dkim_private_key,
            },
          }),
        };
        break;
    }

    providerService.addProvider(providerConfigObj);
    const provider = providerService.getProvider(providerConfig.provider as 'brevo' | 'mailjet' | 'resend' | 'nodemailer');

    if (!provider) {
      return res.status(500).json({ error: 'Failed to initialize email provider' });
    }

    // Send test email
    await provider.sendEmail({
      to,
      subject,
      htmlContent: content,
      fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
      fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
    });

    return res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error: any) {
    return next(error);
  }
});

export default router;

