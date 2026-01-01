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
      const scheduledAt = new Date(data.scheduled_at);
      const now = new Date();
      const delay = Math.max(0, scheduledAt.getTime() - now.getTime());

      const schedulingQueue = getSchedulingQueue();
      await schedulingQueue.add(
        { campaignId: campaign.id },
        {
          delay,
          jobId: `campaign-${campaign.id}`, // Unique job ID to prevent duplicates
          removeOnComplete: true,
          removeOnFail: false,
        }
      );
      console.log(`Campaign ${campaign.id} scheduled for ${scheduledAt.toISOString()}`);
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
    const schedulingQueue = getSchedulingQueue();
    const jobId = `campaign-${campaignId}`;

    // Remove existing scheduled job if any
    const existingJob = await schedulingQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }

    // If new scheduled_at is set, add to queue
    if (updatedCampaign.scheduled_at && updatedCampaign.status === 'scheduled') {
      const scheduledAt = new Date(updatedCampaign.scheduled_at);
      const now = new Date();
      const delay = Math.max(0, scheduledAt.getTime() - now.getTime());

      // Only schedule if in the future
      if (delay > 0) {
        await schedulingQueue.add(
          { campaignId },
          {
            delay,
            jobId,
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
        console.log(`Campaign ${campaignId} rescheduled for ${scheduledAt.toISOString()}`);
      }
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

    // Queue emails
    const emailQueue = getEmailQueue();
    const fromEmail = campaign.from_email || process.env.DEFAULT_FROM_EMAIL || '';

    for (const contact of listContacts) {
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

      // Personalize subject and content - handle both {{name}} and {{ name }} syntax
      const personalizedSubject = this.personalizationService.renderTemplate(
        campaign.subject,
        personalizationData
      );
      const personalizedContent = this.personalizationService.renderTemplate(
        campaign.content,
        personalizationData
      );

      // Determine send time (spread out)
      const sendDelay = Math.floor(Math.random() * 3600); // Random delay up to 1 hour
      const scheduledAt = new Date(Date.now() + sendDelay * 1000);

      // Add to queue
      await emailQueue.add({
        userId,
        contactId: contact.id,
        campaignId,
        toEmail: contact.email,
        subject: personalizedSubject,
        content: personalizedContent,
        fromEmail,
        fromName: campaign.from_name || process.env.DEFAULT_FROM_NAME,
        scheduledAt: scheduledAt.toISOString(),
      }, {
        delay: sendDelay * 1000,
      });
    }

    // Mark campaign as sent
    await pool.query(
      'UPDATE campaigns SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['sent', campaignId]
    );

    return { queued: listContacts.length };
  }

  async getCampaignStats(userId: number, campaignId: number) {
    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'complained') as complained
       FROM email_queue
       WHERE campaign_id = $1 AND user_id = $2`,
      [campaignId, userId]
    );

    const stats = result.rows[0];
    const sent = parseInt(stats.sent) || 0;
    const delivered = parseInt(stats.delivered) || 0;

    // Get opens and clicks from events
    const eventsResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE event_type = 'opened') as opens,
        COUNT(*) FILTER (WHERE event_type = 'clicked') as clicks
       FROM email_events
       WHERE campaign_id = $1`,
      [campaignId]
    );

    const events = eventsResult.rows[0];

    return {
      sent,
      delivered,
      bounced: parseInt(stats.bounced) || 0,
      complained: parseInt(stats.complained) || 0,
      opens: parseInt(events.opens) || 0,
      clicks: parseInt(events.clicks) || 0,
      openRate: sent > 0 ? ((parseInt(events.opens) || 0) / sent * 100).toFixed(2) : '0.00',
      clickRate: sent > 0 ? ((parseInt(events.clicks) || 0) / sent * 100).toFixed(2) : '0.00',
      deliveryRate: sent > 0 ? (delivered / sent * 100).toFixed(2) : '0.00',
    };
  }
}

