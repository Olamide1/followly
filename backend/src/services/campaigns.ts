import { pool } from '../database/connection';
import { createError } from '../middleware/errorHandler';
import { PersonalizationService } from './personalization';
import { RoutingService } from './routing';
import { EmailProviderService } from './providers';
import { getEmailQueue, getSchedulingQueue } from './queues';
import { WarmupService } from './warmup';

export interface CampaignData {
  name: string;
  type: 'broadcast' | 'lifecycle';
  subject: string;
  content: string;
  from_email?: string;
  from_name?: string;
  list_id?: number;
  scheduled_at?: Date;
}

export class CampaignService {
  private personalizationService: PersonalizationService;

  constructor(
    _routingService: RoutingService,
    _providerService: EmailProviderService,
    _warmupService: WarmupService
  ) {
    this.personalizationService = PersonalizationService.getInstance();
    // Services stored for potential future use
    void _routingService;
    void _providerService;
    void _warmupService;
  }

  async createCampaign(userId: number, data: CampaignData) {
    // Validate template
    const validation = this.personalizationService.validateTemplate(data.content);
    if (!validation.valid) {
      throw createError(`Template validation failed: ${validation.errors.join(', ')}`, 400);
    }

    const result = await pool.query(
      `INSERT INTO campaigns 
       (user_id, name, type, subject, content, from_email, from_name, list_id, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        data.name,
        data.type,
        data.subject,
        data.content,
        data.from_email || process.env.DEFAULT_FROM_EMAIL,
        data.from_name || process.env.DEFAULT_FROM_NAME,
        data.list_id,
        data.scheduled_at,
        data.scheduled_at ? 'scheduled' : 'draft',
      ]
    );

    const campaign = result.rows[0];

    // If scheduled, add to scheduling queue
    if (data.scheduled_at) {
      // Validate scheduled_at date
      const scheduledAt = new Date(data.scheduled_at);
      if (isNaN(scheduledAt.getTime())) {
        // Invalid date - update status back to draft
        await pool.query(
          'UPDATE campaigns SET status = $1 WHERE id = $2',
          ['draft', campaign.id]
        );
        throw createError('Invalid scheduled date format', 400);
      }

      const now = new Date();
      const delay = Math.max(0, scheduledAt.getTime() - now.getTime());

      // Only schedule if in the future
      if (delay > 0) {
        try {
          const schedulingQueue = getSchedulingQueue();
          const job = await schedulingQueue.add(
            { campaignId: campaign.id },
            {
              delay,
              jobId: `campaign-${campaign.id}`, // Unique job ID to prevent duplicates
              removeOnComplete: true,
              removeOnFail: false,
            }
          );
          console.log(`✅ Campaign ${campaign.id} scheduled for ${scheduledAt.toISOString()} (Job ID: ${job.id})`);
        } catch (queueError: any) {
          // Queue operation failed - update status back to draft to prevent stranded campaigns
          console.error(`Failed to add campaign ${campaign.id} to scheduling queue:`, queueError);
          await pool.query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            ['draft', campaign.id]
          );
          // Return campaign with updated status
          campaign.status = 'draft';
          throw createError(
            'Campaign saved but scheduling failed. The scheduling service may be temporarily unavailable. Please try scheduling again later.',
            503
          );
        }
      } else {
        // Scheduled time is in the past - update status back to draft
        await pool.query(
          'UPDATE campaigns SET status = $1 WHERE id = $2',
          ['draft', campaign.id]
        );
        campaign.status = 'draft';
        throw createError('Scheduled time must be in the future', 400);
      }
    }

    return campaign;
  }

  async getCampaign(userId: number, campaignId: number) {
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [campaignId, userId]
    );

    if (result.rows.length === 0) {
      throw createError('Campaign not found', 404);
    }

    return result.rows[0];
  }

  async listCampaigns(userId: number, options: {
    type?: 'broadcast' | 'lifecycle';
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM campaigns WHERE user_id = $1';
    const params: any[] = [userId];
    let paramCount = 1;

    if (options.type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(options.type);
    }

    if (options.status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(options.status);
    }

    if (options.search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR subject ILIKE $${paramCount})`;
      params.push(`%${options.search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get stats for each campaign
    for (const campaign of result.rows) {
      const stats = await this.getCampaignStats(userId, campaign.id);
      campaign.stats = stats;
    }

    // Get total count
    const countQuery = query.replace(/SELECT \*/, 'SELECT COUNT(*)').replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    return {
      campaigns: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateCampaign(
    userId: number,
    campaignId: number,
    data: Partial<CampaignData>
  ) {
    // Verify ownership
    const existing = await this.getCampaign(userId, campaignId);

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(data.name);
    }
    if (data.subject !== undefined) {
      updates.push(`subject = $${paramCount++}`);
      params.push(data.subject);
    }
    if (data.content !== undefined) {
      // Validate template
      const validation = this.personalizationService.validateTemplate(data.content);
      if (!validation.valid) {
        throw createError(`Template validation failed: ${validation.errors.join(', ')}`, 400);
      }
      updates.push(`content = $${paramCount++}`);
      params.push(data.content);
    }
    if (data.from_email !== undefined) {
      updates.push(`from_email = $${paramCount++}`);
      params.push(data.from_email);
    }
    if (data.from_name !== undefined) {
      updates.push(`from_name = $${paramCount++}`);
      params.push(data.from_name);
    }
    if (data.list_id !== undefined) {
      updates.push(`list_id = $${paramCount++}`);
      params.push(data.list_id);
    }
    if (data.scheduled_at !== undefined) {
      updates.push(`scheduled_at = $${paramCount++}`);
      params.push(data.scheduled_at);
      if (data.scheduled_at) {
        updates.push(`status = 'scheduled'`);
      } else {
        // If scheduled_at is cleared, set status back to draft
        updates.push(`status = 'draft'`);
      }
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(campaignId, userId);

    await pool.query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++}`,
      params
    );

    const updatedCampaign = await this.getCampaign(userId, campaignId);

    // Handle scheduling queue updates
    try {
      const schedulingQueue = getSchedulingQueue();
      const jobId = `campaign-${campaignId}`;

      // Remove existing scheduled job if any
      try {
        const existingJob = await schedulingQueue.getJob(jobId);
        if (existingJob) {
          await existingJob.remove();
        }
      } catch (removeError) {
        // Log but don't fail if job removal fails
        console.warn(`Failed to remove existing scheduled job for campaign ${campaignId}:`, removeError);
      }

      // If new scheduled_at is set, add to queue
      if (updatedCampaign.scheduled_at && updatedCampaign.status === 'scheduled') {
        // Validate scheduled_at date
        const scheduledAt = new Date(updatedCampaign.scheduled_at);
        if (isNaN(scheduledAt.getTime())) {
          // Invalid date - update status back to draft
          await pool.query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            ['draft', campaignId]
          );
          throw createError('Invalid scheduled date format', 400);
        }

        const now = new Date();
        const delay = Math.max(0, scheduledAt.getTime() - now.getTime());

        // Only schedule if in the future
        if (delay > 0) {
          const job = await schedulingQueue.add(
            { campaignId },
            {
              delay,
              jobId,
              removeOnComplete: true,
              removeOnFail: false,
            }
          );
          console.log(`✅ Campaign ${campaignId} rescheduled for ${scheduledAt.toISOString()} (Job ID: ${job.id})`);
        } else {
          // Scheduled time is in the past - update status back to draft
          await pool.query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            ['draft', campaignId]
          );
          updatedCampaign.status = 'draft';
          throw createError('Scheduled time must be in the future', 400);
        }
      }
    } catch (queueError: any) {
      // If it's already a createError, rethrow it
      if (queueError.statusCode) {
        throw queueError;
      }
      
      // Queue operation failed - update status back to draft to prevent stranded campaigns
      console.error(`Failed to update scheduling queue for campaign ${campaignId}:`, queueError);
      
      // Only update status if campaign was supposed to be scheduled
      if (updatedCampaign.scheduled_at && updatedCampaign.status === 'scheduled') {
        await pool.query(
          'UPDATE campaigns SET status = $1 WHERE id = $2',
          ['draft', campaignId]
        );
        updatedCampaign.status = 'draft';
        throw createError(
          'Campaign updated but scheduling failed. The scheduling service may be temporarily unavailable. Please try scheduling again later.',
          503
        );
      }
      // If not scheduling, just log the error but don't fail the update
      console.warn(`Queue error for campaign ${campaignId} (not scheduling):`, queueError);
    }

    return updatedCampaign;
  }

  async deleteCampaign(userId: number, campaignId: number) {
    const result = await pool.query(
      'DELETE FROM campaigns WHERE id = $1 AND user_id = $2 RETURNING id',
      [campaignId, userId]
    );

    if (result.rows.length === 0) {
      throw createError('Campaign not found', 404);
    }

    // Remove from scheduling queue if exists
    try {
      const schedulingQueue = getSchedulingQueue();
      const jobId = `campaign-${campaignId}`;
      const existingJob = await schedulingQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove();
        console.log(`Removed scheduled job for campaign ${campaignId}`);
      }
    } catch (error) {
      // Log but don't fail if queue removal fails
      console.error(`Failed to remove scheduled job for campaign ${campaignId}:`, error);
    }
  }

  async sendCampaign(userId: number, campaignId: number) {
    const campaign = await this.getCampaign(userId, campaignId);

    if (campaign.status === 'sending' || campaign.status === 'sent') {
      throw createError('Campaign already sent or sending', 400);
    }

    // Validate list_id
    if (!campaign.list_id) {
      throw createError('Campaign must have a list assigned', 400);
    }

    // Get ALL list contacts (no pagination limit for campaigns)
    const listService = new (await import('./lists')).ListService();
    const listContacts = await listService.getAllListContacts(userId, campaign.list_id);

    if (listContacts.length === 0) {
      throw createError('No contacts in list', 400);
    }

    // Update campaign status
    await pool.query(
      'UPDATE campaigns SET status = $1 WHERE id = $2',
      ['sending', campaignId]
    );

    // Queue emails in batches to avoid memory issues and improve performance
    const emailQueue = getEmailQueue();
    const fromEmail = campaign.from_email || process.env.DEFAULT_FROM_EMAIL || '';
    const BATCH_SIZE = 50; // Process contacts in batches of 50
    let queuedCount = 0;

    // Process contacts in batches
    for (let i = 0; i < listContacts.length; i += BATCH_SIZE) {
      const batch = listContacts.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (contact) => {
        // Check suppression
        const suppressed = await pool.query(
          'SELECT id FROM suppression_list WHERE user_id = $1 AND email = $2',
          [userId, contact.email]
        );

        if (suppressed.rows.length > 0) {
          return null; // Skip suppressed contacts
        }

        // Personalize content
        const personalizationData = {
          name: contact.name || '',
          company: contact.company || '',
          email: contact.email,
        };

        // Personalize subject and content - handle both {{name}} and {{ name }} syntax
        const personalizedSubject = this.personalizationService.renderTemplate(
          campaign.subject,
          personalizationData
        );
        let personalizedContent = this.personalizationService.renderTemplate(
          campaign.content,
          personalizationData
        );

        // Append unsubscribe footer automatically
        const { appendUnsubscribeFooter } = await import('./unsubscribe');
        personalizedContent = await appendUnsubscribeFooter(
          userId,
          contact.email,
          personalizedContent,
          {
            includePreferences: true,
            includeViewInBrowser: false,
          }
        );

        // Determine send time (spread out)
        const sendDelay = Math.floor(Math.random() * 3600); // Random delay up to 1 hour
        const scheduledAt = new Date(Date.now() + sendDelay * 1000);

        // Create email_queue record upfront for tracking
        const emailQueueResult = await pool.query(
          `INSERT INTO email_queue 
           (user_id, contact_id, campaign_id, to_email, subject, content, from_email, from_name, status, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            userId,
            contact.id,
            campaignId,
            contact.email,
            personalizedSubject,
            personalizedContent,
            fromEmail,
            campaign.from_name || process.env.DEFAULT_FROM_NAME,
            'queued',
            scheduledAt,
          ]
        );
        const emailQueueId = emailQueueResult.rows[0].id;

        // Add to Bull queue with email_queue_id for reference
        await emailQueue.add({
          userId,
          contactId: contact.id,
          campaignId,
          emailQueueId, // Include email_queue_id in job data
          toEmail: contact.email,
          subject: personalizedSubject,
          content: personalizedContent,
          fromEmail,
          fromName: campaign.from_name || process.env.DEFAULT_FROM_NAME,
          scheduledAt: scheduledAt.toISOString(),
        }, {
          delay: sendDelay * 1000,
          jobId: `email-${emailQueueId}`, // Use email_queue_id as job ID for easy lookup
        });

        return emailQueueId;
      });

      // Wait for batch to complete before processing next batch
      const batchResults = await Promise.all(batchPromises);
      queuedCount += batchResults.filter(id => id !== null).length;

      // Log progress for large campaigns
      if (listContacts.length > 100) {
        console.log(`[Campaign Send] Processed ${Math.min(i + BATCH_SIZE, listContacts.length)}/${listContacts.length} contacts for campaign ${campaignId}`);
      }
    }

    // Mark campaign as sent
    await pool.query(
      'UPDATE campaigns SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['sent', campaignId]
    );

    return { queued: queuedCount };
  }

  async getCampaignStats(userId: number, campaignId: number) {
    // Get sent count from email_queue (emails that were sent)
    const sentResult = await pool.query(
      `SELECT COUNT(*) as sent
       FROM email_queue
       WHERE campaign_id = $1 AND user_id = $2 AND status = 'sent'`,
      [campaignId, userId]
    );
    const sent = parseInt(sentResult.rows[0]?.sent || '0');

    // Get all engagement stats from email_events (delivered, bounced, complained, opened, clicked)
    // Count distinct email_queue_ids to get unique events per email (not total events)
    const eventsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT CASE WHEN e.event_type = 'delivered' THEN e.email_queue_id END) as delivered,
        COUNT(DISTINCT CASE WHEN e.event_type = 'bounced' THEN e.email_queue_id END) as bounced,
        COUNT(DISTINCT CASE WHEN e.event_type = 'complained' THEN e.email_queue_id END) as complained,
        COUNT(DISTINCT CASE WHEN e.event_type = 'opened' THEN e.email_queue_id END) as opens,
        COUNT(DISTINCT CASE WHEN e.event_type = 'clicked' THEN e.email_queue_id END) as clicks
       FROM email_events e
       INNER JOIN email_queue eq ON e.email_queue_id = eq.id
       WHERE eq.campaign_id = $1 AND eq.user_id = $2`,
      [campaignId, userId]
    );

    const events = eventsResult.rows[0] || {};
    const delivered = parseInt(events.delivered || '0');
    const bounced = parseInt(events.bounced || '0');
    const complained = parseInt(events.complained || '0');
    const opens = parseInt(events.opens || '0');
    const clicks = parseInt(events.clicks || '0');

    // Debug logging for tracking issues (only log if sent > 0 and opens/clicks are 0)
    if (sent > 0 && opens === 0 && clicks === 0) {
      // Check if there are any events at all for this campaign
      const debugResult = await pool.query(
        `SELECT event_type, COUNT(*) as count
         FROM email_events e
         INNER JOIN email_queue eq ON e.email_queue_id = eq.id
         WHERE eq.campaign_id = $1 AND eq.user_id = $2
         GROUP BY event_type`,
        [campaignId, userId]
      );
      
      console.log(`[Campaign Stats] Campaign ${campaignId} has ${sent} sent emails but 0 opens/clicks. Event breakdown:`, 
        debugResult.rows.map((r: any) => `${r.event_type}: ${r.count}`)
      );
      
      // Check if tracking tokens exist for sent emails
      const tokenCheck = await pool.query(
        `SELECT COUNT(DISTINCT tt.email_queue_id) as tokens_count
         FROM tracking_tokens tt
         INNER JOIN email_queue eq ON tt.email_queue_id = eq.id
         WHERE eq.campaign_id = $1 AND eq.user_id = $2 AND eq.status = 'sent'`,
        [campaignId, userId]
      );
      console.log(`[Campaign Stats] Tracking tokens found for ${tokenCheck.rows[0]?.tokens_count || 0} sent emails`);
    }

    // Calculate rates
    const openRate = sent > 0 ? ((opens / sent) * 100).toFixed(2) : '0.00';
    const clickRate = sent > 0 ? ((clicks / sent) * 100).toFixed(2) : '0.00';
    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(2) : '0.00';

    return {
      sent,
      delivered,
      bounced,
      complained,
      opens,
      clicks,
      openRate,
      clickRate,
      deliveryRate,
    };
  }

  /**
   * Recovery function: Re-queue any scheduled campaigns that aren't in the queue
   * This should be called on server startup to ensure no campaigns are stranded
   */
  async recoverScheduledCampaigns(): Promise<number> {
    try {
      // Check if queue is initialized before attempting recovery
      let schedulingQueue;
      try {
        schedulingQueue = getSchedulingQueue();
      } catch (queueError) {
        // Queue not initialized - skip recovery
        console.warn('Scheduling queue not available, skipping campaign recovery');
        return 0;
      }
      
      // Find all scheduled campaigns
      const result = await pool.query(
        `SELECT id, scheduled_at, user_id 
         FROM campaigns 
         WHERE status = 'scheduled' 
         AND scheduled_at IS NOT NULL 
         AND scheduled_at > CURRENT_TIMESTAMP
         ORDER BY scheduled_at ASC`
      );

      let recovered = 0;
      const now = new Date();

      for (const campaign of result.rows) {
        // Validate scheduled_at exists and is valid
        if (!campaign.scheduled_at) {
          console.warn(`Campaign ${campaign.id} has null/undefined scheduled_at, skipping recovery`);
          continue;
        }

        const scheduledAt = new Date(campaign.scheduled_at);
        const scheduledTime = scheduledAt.getTime();
        
        // Validate: must be a valid date (not NaN) and not epoch (1970-01-01)
        if (isNaN(scheduledTime) || scheduledTime === 0) {
          console.warn(`Campaign ${campaign.id} has invalid scheduled_at (${campaign.scheduled_at}), skipping recovery`);
          continue;
        }

        const delay = Math.max(0, scheduledTime - now.getTime());
        
        if (delay > 0) {
          try {
            const jobId = `campaign-${campaign.id}`;
            
            // Check if job already exists
            const existingJob = await schedulingQueue.getJob(jobId);
            if (existingJob) {
              // Job exists, skip
              continue;
            }

            // Add to queue
            await schedulingQueue.add(
              { campaignId: campaign.id },
              {
                delay,
                jobId,
                removeOnComplete: true,
                removeOnFail: false,
              }
            );
            recovered++;
            console.log(`Recovered scheduled campaign ${campaign.id} for ${scheduledAt.toISOString()}`);
          } catch (error: any) {
            console.error(`Failed to recover campaign ${campaign.id}:`, error);
            // Don't throw - continue with other campaigns
          }
        } else {
          // Scheduled time has passed - update status to draft
          console.warn(`Campaign ${campaign.id} scheduled time has passed, setting to draft`);
          await pool.query(
            'UPDATE campaigns SET status = $1 WHERE id = $2',
            ['draft', campaign.id]
          );
        }
      }

      if (recovered > 0) {
        console.log(`✅ Recovered ${recovered} scheduled campaign(s) on startup`);
      }
      
      return recovered;
    } catch (error: any) {
      // If queue is not available, log but don't crash
      console.error('Failed to recover scheduled campaigns (queue may be unavailable):', error);
      return 0;
    }
  }

  /**
   * Recovery function: Re-queue emails for campaigns that are marked as 'sent' 
   * but have no email_queue records or have failed email_queue records
   * This helps recover from worker failures
   */
  async recoverCampaignEmails(userId: number, campaignId: number): Promise<{ recovered: number; errors: string[] }> {
    const campaign = await this.getCampaign(userId, campaignId);
    const errors: string[] = [];

    // Only recover campaigns that are marked as 'sent' or 'sending'
    if (campaign.status !== 'sent' && campaign.status !== 'sending') {
      throw createError('Campaign is not in a recoverable state. Only sent/sending campaigns can be recovered.', 400);
    }

    // Validate list_id
    if (!campaign.list_id) {
      throw createError('Campaign must have a list assigned', 400);
    }

    // Get all list contacts
    const listService = new (await import('./lists')).ListService();
    const listContacts = await listService.getAllListContacts(userId, campaign.list_id);

    if (listContacts.length === 0) {
      throw createError('No contacts in list', 400);
    }

    // Get existing email_queue records for this campaign
    const existingRecords = await pool.query(
      'SELECT contact_id, status FROM email_queue WHERE campaign_id = $1',
      [campaignId]
    );
    
    // Exclude contacts that have any non-failed status (pending, queued, sending, sent, bounced, complained)
    // Only re-queue contacts with 'failed' status or no record at all
    const nonFailedStatuses = ['pending', 'queued', 'sending', 'sent', 'bounced', 'complained'];
    const existingContactIds = new Set(
      existingRecords.rows
        .filter((r: any) => nonFailedStatuses.includes(r.status)) // Exclude all non-failed statuses
        .map((r: any) => r.contact_id)
    );

    // Get contacts that need to be re-queued (no record or only failed records)
    const contactsToQueue = listContacts.filter(
      (contact: any) => !existingContactIds.has(contact.id)
    );

    if (contactsToQueue.length === 0) {
      return { recovered: 0, errors: [] };
    }

    const emailQueue = getEmailQueue();
    const fromEmail = campaign.from_email || process.env.DEFAULT_FROM_EMAIL || '';
    let recovered = 0;

    for (const contact of contactsToQueue) {
      try {
        // Check suppression
        const suppressed = await pool.query(
          'SELECT id FROM suppression_list WHERE user_id = $1 AND email = $2',
          [userId, contact.email]
        );

        if (suppressed.rows.length > 0) {
          continue; // Skip suppressed contacts
        }

        // Personalize content
        const personalizationData = {
          name: contact.name || '',
          company: contact.company || '',
          email: contact.email,
        };

        const personalizedSubject = this.personalizationService.renderTemplate(
          campaign.subject,
          personalizationData
        );
        let personalizedContent = this.personalizationService.renderTemplate(
          campaign.content,
          personalizationData
        );

        // Append unsubscribe footer
        const { appendUnsubscribeFooter } = await import('./unsubscribe');
        personalizedContent = await appendUnsubscribeFooter(
          userId,
          contact.email,
          personalizedContent,
          {
            includePreferences: true,
            includeViewInBrowser: false,
          }
        );

        // Schedule for immediate send (no delay for recovery)
        const scheduledAt = new Date();

        // Create email_queue record
        const emailQueueResult = await pool.query(
          `INSERT INTO email_queue 
           (user_id, contact_id, campaign_id, to_email, subject, content, from_email, from_name, status, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            userId,
            contact.id,
            campaignId,
            contact.email,
            personalizedSubject,
            personalizedContent,
            fromEmail,
            campaign.from_name || process.env.DEFAULT_FROM_NAME,
            'queued',
            scheduledAt,
          ]
        );
        const emailQueueId = emailQueueResult.rows[0].id;

        // Add to Bull queue
        await emailQueue.add({
          userId,
          contactId: contact.id,
          campaignId,
          emailQueueId,
          toEmail: contact.email,
          subject: personalizedSubject,
          content: personalizedContent,
          fromEmail,
          fromName: campaign.from_name || process.env.DEFAULT_FROM_NAME,
          scheduledAt: scheduledAt.toISOString(),
        }, {
          jobId: `email-${emailQueueId}`,
        });

        recovered++;
      } catch (error: any) {
        errors.push(`Failed to recover email for ${contact.email}: ${error.message}`);
        console.error(`Failed to recover email for contact ${contact.id}:`, error);
      }
    }

    // Update campaign status back to 'sending' if it was 'sent' and we recovered some
    if (recovered > 0 && campaign.status === 'sent') {
      await pool.query(
        'UPDATE campaigns SET status = $1 WHERE id = $2',
        ['sending', campaignId]
      );
    }

    return { recovered, errors };
  }
}

