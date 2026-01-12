import { Job } from 'bull';
import { pool } from '../database/connection';
import { RoutingService } from '../services/routing';
import { EmailProviderService, ProviderConfig, ProviderType } from '../services/providers';
import { WarmupService } from '../services/warmup';
import {
  generateTrackingToken,
  storeTrackingToken,
  getTrackingPixelUrl,
  addTrackingPixel,
  wrapLinksWithTracking,
} from '../services/tracking';

let routingService: RoutingService | null = null;
let warmupService: WarmupService | null = null;

// Cache provider services per user (to avoid reloading on every email)
const userProviderServices: Map<number, EmailProviderService> = new Map();

/**
 * Load and initialize providers for a specific user from the database
 */
async function loadUserProviders(userId: number): Promise<EmailProviderService> {
  // Check cache first
  if (userProviderServices.has(userId)) {
    return userProviderServices.get(userId)!;
  }

  // Create new provider service for this user
  const providerService = new EmailProviderService();

  // Load user's provider configs from database
  const result = await pool.query(
    'SELECT * FROM provider_configs WHERE user_id = $1 AND is_active = true ORDER BY is_default DESC, created_at ASC',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No active email providers configured for user ${userId}. Please add a provider in Settings.`);
  }

  // Initialize each provider
  for (const config of result.rows) {
    try {
      const providerConfig: ProviderConfig = {
        provider: config.provider as 'brevo' | 'mailjet' | 'resend',
        dailyLimit: config.daily_limit || undefined,
        isDefault: config.is_default || false,
      };

      // Set provider-specific config
      switch (config.provider) {
        case 'brevo':
          if (!config.api_key) {
            console.warn(`Brevo provider for user ${userId} missing API key, skipping`);
            continue;
          }
          providerConfig.brevo = {
            apiKey: config.api_key,
            fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
            fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
          };
          break;

        case 'mailjet':
          if (!config.api_key || !config.api_secret) {
            console.warn(`Mailjet provider for user ${userId} missing API key or secret, skipping`);
            continue;
          }
          providerConfig.mailjet = {
            apiKey: config.api_key,
            apiSecret: config.api_secret,
            fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
            fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
          };
          break;

        case 'resend':
          if (!config.api_key) {
            console.warn(`Resend provider for user ${userId} missing API key, skipping`);
            continue;
          }
          providerConfig.resend = {
            apiKey: config.api_key,
            fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
            fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
          };
          break;

        default:
          console.warn(`Unknown provider type: ${config.provider}, skipping`);
          continue;
      }

      // Add provider to service
      providerService.addProvider(providerConfig);
      console.log(`Loaded ${config.provider} provider for user ${userId}`);
    } catch (error: any) {
      console.error(`Failed to load ${config.provider} provider for user ${userId}:`, error.message);
      // Continue loading other providers even if one fails
    }
  }

  // Verify at least one provider was successfully loaded
  const loadedProviders = ['brevo', 'mailjet', 'resend'].filter(p => providerService.hasProvider(p as ProviderType));
  if (loadedProviders.length === 0) {
    throw new Error(`No email providers could be loaded for user ${userId}. All providers failed to initialize.`);
  }

  // Cache the service for this user
  userProviderServices.set(userId, providerService);

  return providerService;
}

export async function processEmailQueue(job: Job) {
  const {
    userId,
    contactId,
    campaignId,
    automationId,
    emailQueueId, // May be provided if record was created upfront
    toEmail,
    subject,
    content,
    fromEmail,
    fromName,
  } = job.data;

  // Declare finalEmailQueueId outside try block so it's available in catch block (Bug 2 fix)
  let finalEmailQueueId: number | undefined = emailQueueId;

  try {
    // Initialize services
    if (!routingService) {
      // We'll create routing service with a temporary provider service
      // It will be replaced per-user
      const tempProviderService = new EmailProviderService();
      routingService = new RoutingService(tempProviderService);
    }
    if (!warmupService) {
      warmupService = new WarmupService();
    }

    // Load user's providers from database
    const providerService = await loadUserProviders(userId);
    
    // Update routing service to use this user's provider service
    // Note: RoutingService needs access to the provider service, but it's created once
    // We'll pass the provider service directly when needed

    // Check if contact is suppressed
    const suppressed = await pool.query(
      'SELECT id FROM suppression_list WHERE user_id = $1 AND email = $2',
      [userId, toEmail]
    );

    if (suppressed.rows.length > 0) {
      // Use finalEmailQueueId if available, otherwise fallback
      if (finalEmailQueueId) {
        await pool.query(
          `UPDATE email_queue SET status = 'failed', error_message = 'Contact suppressed' 
           WHERE id = $1`,
          [finalEmailQueueId]
        );
      } else {
        // Fallback for backward compatibility
        // Handle NULL values correctly: only use IS NULL when BOTH are NULL
        // Otherwise, only match the provided non-NULL value
        let whereClause: string;
        const params: any[] = [contactId];
        
        if (campaignId !== null && campaignId !== undefined && automationId !== null && automationId !== undefined) {
          // Both provided: match either
          whereClause = 'contact_id = $1 AND (campaign_id = $2 OR automation_id = $3)';
          params.push(campaignId, automationId);
        } else if (campaignId !== null && campaignId !== undefined) {
          // Only campaignId provided: match only campaign_id
          whereClause = 'contact_id = $1 AND campaign_id = $2';
          params.push(campaignId);
        } else if (automationId !== null && automationId !== undefined) {
          // Only automationId provided: match only automation_id
          whereClause = 'contact_id = $1 AND automation_id = $2';
          params.push(automationId);
        } else {
          // Both NULL: match both NULL
          whereClause = 'contact_id = $1 AND campaign_id IS NULL AND automation_id IS NULL';
        }
        
        // Use subquery to find the most recent record first, then update by ID
        // (PostgreSQL doesn't support ORDER BY/LIMIT in UPDATE statements)
        // This ensures only one record is updated, preventing unrelated emails from being marked as suppressed
        await pool.query(
          `UPDATE email_queue SET status = 'failed', error_message = 'Contact suppressed' 
           WHERE id = (
             SELECT id FROM email_queue
             WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT 1
           )`,
          params
        );
      }
      return;
    }

    // Select provider first (to determine which one we'll use)
    const campaignType = campaignId ? 'broadcast' : 'lifecycle';
    
    // Create a temporary routing service with user's providers for selection
    const userRoutingService = new RoutingService(providerService);
    
    // Debug: Log available providers
    const availableProviders = ['brevo', 'mailjet', 'resend'].filter(p => providerService.hasProvider(p as ProviderType));
    console.log(`Available providers for user ${userId}:`, availableProviders);
    
    const routingDecision = await userRoutingService.selectProvider(userId, campaignType);

    // Check warmup limits with the actual provider
    const domain = fromEmail.split('@')[1] || '';
    const canSend = await warmupService.canSend(userId, domain, routingDecision.provider);

    if (!canSend) {
      // Reschedule for later
      await job.moveToDelayed(Date.now() + 3600000); // 1 hour later
      return;
    }

    // Get provider instance
    const emailProvider = providerService.getProvider(routingDecision.provider);
    if (!emailProvider) {
      throw new Error(`Provider ${routingDecision.provider} not available for user ${userId}`);
    }

    // Ensure we have finalEmailQueueId BEFORE sending email (Bug 1 fix)
    // This ensures tracking is always added if a record exists or can be created
    if (!finalEmailQueueId) {
      // Try to find existing record
      // Handle NULL values correctly: only use IS NULL when BOTH are NULL
      // Otherwise, only match the provided non-NULL value
      let whereClause: string;
      const params: any[] = [contactId];
      
      if (campaignId !== null && campaignId !== undefined && automationId !== null && automationId !== undefined) {
        // Both provided: match either
        whereClause = 'contact_id = $1 AND (campaign_id = $2 OR automation_id = $3)';
        params.push(campaignId, automationId);
      } else if (campaignId !== null && campaignId !== undefined) {
        // Only campaignId provided: match only campaign_id
        whereClause = 'contact_id = $1 AND campaign_id = $2';
        params.push(campaignId);
      } else if (automationId !== null && automationId !== undefined) {
        // Only automationId provided: match only automation_id
        whereClause = 'contact_id = $1 AND automation_id = $2';
        params.push(automationId);
      } else {
        // Both NULL: match both NULL
        whereClause = 'contact_id = $1 AND campaign_id IS NULL AND automation_id IS NULL';
      }
      
      const existingRecord = await pool.query(
        `SELECT id FROM email_queue 
         WHERE ${whereClause}
         ORDER BY created_at DESC LIMIT 1`,
        params
      );
      if (existingRecord.rows.length > 0) {
        finalEmailQueueId = existingRecord.rows[0].id;
      } else {
        // Create record if it doesn't exist (Bug 1 fix: create BEFORE sending to ensure tracking)
        const newRecord = await pool.query(
          `INSERT INTO email_queue 
           (user_id, contact_id, campaign_id, automation_id, to_email, subject, content, from_email, from_name, status, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            userId,
            contactId,
            campaignId,
            automationId,
            toEmail,
            subject,
            content,
            fromEmail,
            fromName,
            'queued', // Will be updated to 'sent' after successful send
          ]
        );
        finalEmailQueueId = newRecord.rows[0].id;
      }
    }

    // Add tracking to email content (now we're guaranteed to have finalEmailQueueId)
    let trackedContent = content;
    let trackingToken: string | null = null;

    if (finalEmailQueueId) {
      // Generate tracking token
      trackingToken = generateTrackingToken(finalEmailQueueId, contactId);
      
      // Store tracking token
      await storeTrackingToken(finalEmailQueueId, contactId, campaignId, trackingToken);
      
      // Add tracking pixel
      const pixelUrl = getTrackingPixelUrl(trackingToken);
      trackedContent = addTrackingPixel(trackedContent, pixelUrl);
      
      // Wrap links with tracking
      trackedContent = wrapLinksWithTracking(trackedContent, trackingToken);
    }

    // Send email with tracked content
    const result = await emailProvider.sendEmail({
      to: toEmail,
      subject,
      htmlContent: trackedContent,
      fromEmail,
      fromName,
    });

    // Record success - finalEmailQueueId is guaranteed to exist at this point

    // Update the email_queue record
    await pool.query(
      `UPDATE email_queue 
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, provider = $1
       WHERE id = $2`,
      [routingDecision.provider, finalEmailQueueId]
    );

    // Record event
    await pool.query(
      `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
       VALUES ($1, $2, $3, 'sent', $4)`,
      [finalEmailQueueId, contactId, campaignId, result.messageId]
    );

    // Record provider usage
    await userRoutingService.recordProviderUsage(userId, routingDecision.provider, true);

    // Record warmup send
    await warmupService.recordSend(userId, domain, routingDecision.provider);

    return result;
  } catch (error: any) {
    console.error('Email send error:', error);

    // Record failure - use finalEmailQueueId (Bug 2 fix: use finalEmailQueueId instead of emailQueueId)
    if (finalEmailQueueId) {
      await pool.query(
        `UPDATE email_queue 
         SET status = 'failed', error_message = $1, retry_count = retry_count + 1
         WHERE id = $2`,
        [error.message, finalEmailQueueId]
      );
    } else {
      // Fallback for backward compatibility (should rarely happen now)
      // Use subquery to find the most recent record first, then update by ID
      // (PostgreSQL doesn't support ORDER BY/LIMIT in UPDATE statements)
      // Handle NULL values correctly: only use IS NULL when BOTH are NULL
      // Otherwise, only match the provided non-NULL value
      let whereClause: string;
      const params: any[] = [error.message, contactId];
      let paramIndex = 3;
      
      if (campaignId !== null && campaignId !== undefined && automationId !== null && automationId !== undefined) {
        // Both provided: match either
        whereClause = `contact_id = $2 AND (campaign_id = $${paramIndex} OR automation_id = $${paramIndex + 1})`;
        params.push(campaignId, automationId);
      } else if (campaignId !== null && campaignId !== undefined) {
        // Only campaignId provided: match only campaign_id
        whereClause = `contact_id = $2 AND campaign_id = $${paramIndex}`;
        params.push(campaignId);
      } else if (automationId !== null && automationId !== undefined) {
        // Only automationId provided: match only automation_id
        whereClause = `contact_id = $2 AND automation_id = $${paramIndex}`;
        params.push(automationId);
      } else {
        // Both NULL: match both NULL
        whereClause = 'contact_id = $2 AND campaign_id IS NULL AND automation_id IS NULL';
      }
      
      await pool.query(
        `UPDATE email_queue 
         SET status = 'failed', error_message = $1, retry_count = retry_count + 1
         WHERE id = (
           SELECT id FROM email_queue
           WHERE ${whereClause}
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        params
      );
    }

    // Record provider error (try to load providers if not already loaded)
    try {
      const providerService = await loadUserProviders(userId);
      const userRoutingService = new RoutingService(providerService);
      const routingDecision = await userRoutingService.selectProvider(userId, 'lifecycle');
      await userRoutingService.recordProviderUsage(userId, routingDecision.provider, false);
    } catch (err) {
      // If we can't load providers, just log the error
      console.error('Failed to record provider error:', err);
    }

    // Retry logic
    const retryCount = job.attemptsMade || 0;
    if (retryCount < 3) {
      throw error; // Will retry
    }

    return { error: error.message };
  }
}

