import { Job } from 'bull';
import { pool } from '../database/connection';
import { RoutingService } from '../services/routing';
import { EmailProviderService, ProviderConfig, ProviderType } from '../services/providers';
import { WarmupService } from '../services/warmup';
import { RateLimiterService } from '../services/rateLimiter';
import {
  generateTrackingToken,
  storeTrackingToken,
  getTrackingPixelUrl,
  addTrackingPixel,
  wrapLinksWithTracking,
} from '../services/tracking';

let routingService: RoutingService | null = null;
let warmupService: WarmupService | null = null;
let rateLimiterService: RateLimiterService | null = null;

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
  
  // Debug: Log all providers found
  console.log(`[loadUserProviders] Found ${result.rows.length} active providers for user ${userId}:`, 
    result.rows.map((r: any) => ({
      id: r.id,
      provider: r.provider,
      has_smtp_host: !!r.smtp_host,
      has_smtp_port: !!r.smtp_port,
      has_smtp_user: !!r.smtp_user,
      has_smtp_pass: !!r.smtp_pass,
    }))
  );

  // Initialize each provider
  for (const config of result.rows) {
    try {
      const providerConfig: ProviderConfig = {
        provider: config.provider as 'brevo' | 'mailjet' | 'resend' | 'nodemailer',
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

        case 'nodemailer':
          // Log the config to debug - show actual values (except password)
          console.log(`[Nodemailer] Loading provider for user ${userId}:`, {
            id: config.id,
            smtp_host: config.smtp_host || 'NULL',
            smtp_port: config.smtp_port || 'NULL',
            smtp_user: config.smtp_user || 'NULL',
            smtp_pass: config.smtp_pass ? '***present***' : 'NULL',
            smtp_secure: config.smtp_secure,
            from_email: config.from_email,
            // Check if columns exist (will be undefined if migration didn't run)
            has_smtp_host_column: 'smtp_host' in config,
            has_smtp_port_column: 'smtp_port' in config,
            has_smtp_user_column: 'smtp_user' in config,
            has_smtp_pass_column: 'smtp_pass' in config,
          });
          
          // Check if columns exist (migration might not have run)
          if (!('smtp_host' in config) || !('smtp_port' in config)) {
            console.error(`[Nodemailer] CRITICAL: SMTP columns don't exist in database! Migration may not have run.`);
            throw new Error('Database migration for nodemailer provider has not been run. Please contact support.');
          }
          
          if (!config.smtp_host || !config.smtp_port || !config.smtp_user || !config.smtp_pass) {
            console.error(`[Nodemailer] Provider for user ${userId} missing SMTP configuration. Missing:`, {
              smtp_host: !config.smtp_host,
              smtp_port: !config.smtp_port,
              smtp_user: !config.smtp_user,
              smtp_pass: !config.smtp_pass,
            });
            console.error(`[Nodemailer] Full config object:`, JSON.stringify(config, null, 2));
            continue;
          }
          
          providerConfig.nodemailer = {
            host: config.smtp_host,
            port: typeof config.smtp_port === 'string' ? parseInt(config.smtp_port, 10) : config.smtp_port,
            secure: config.smtp_secure || false,
            user: config.smtp_user,
            pass: config.smtp_pass,
            fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
            fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
            // Add DKIM if configured
            ...(config.dkim_domain && config.dkim_private_key && {
              dkim: {
                domainName: config.dkim_domain,
                keySelector: config.dkim_selector || 'default',
                privateKey: config.dkim_private_key,
              },
            }),
            // Enable connection pooling for high-volume sending
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
          };
          
          console.log(`[Nodemailer] Successfully configured provider for user ${userId}`);
          break;

        default:
          console.warn(`Unknown provider type: ${config.provider}, skipping`);
          continue;
      }

      // Add provider to service
      // Verify nodemailer config is set before adding
      if (config.provider === 'nodemailer' && !providerConfig.nodemailer) {
        console.error(`[Nodemailer] ERROR: providerConfig.nodemailer is undefined for user ${userId}! Provider config:`, {
          provider: providerConfig.provider,
          hasNodemailer: !!providerConfig.nodemailer,
        });
        throw new Error(`Nodemailer config not properly set for user ${userId}`);
      }
      
      providerService.addProvider(providerConfig);
      console.log(`Loaded ${config.provider} provider for user ${userId}`);
    } catch (error: any) {
      console.error(`Failed to load ${config.provider} provider for user ${userId}:`, error.message);
      // Continue loading other providers even if one fails
    }
  }

  // Verify at least one provider was successfully loaded
  const loadedProviders = ['brevo', 'mailjet', 'resend', 'nodemailer'].filter(p => providerService.hasProvider(p as ProviderType));
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

  // Declare variables outside try block so they're available in catch block
  let finalEmailQueueId: number | undefined = emailQueueId;
  let routingDecision: { provider: ProviderType; reason: string } | null = null;
  const domain = fromEmail.split('@')[1] || '';

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
    if (!rateLimiterService) {
      rateLimiterService = new RateLimiterService();
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
    const availableProviders = ['brevo', 'mailjet', 'resend', 'nodemailer'].filter(p => providerService.hasProvider(p as ProviderType));
    console.log(`Available providers for user ${userId}:`, availableProviders);
    
    routingDecision = await userRoutingService.selectProvider(userId, campaignType);

    // Check warmup limits with the actual provider
    const canSendWarmup = await warmupService.canSend(userId, domain, routingDecision.provider);

    if (!canSendWarmup) {
      // Reschedule for later
      await job.moveToDelayed(Date.now() + 3600000); // 1 hour later
      return;
    }

    // Check rate limit for domain (prevents hitting SMTP provider limits)
    // Only check for Nodemailer/SMTP providers (they have strict hourly limits)
    if (routingDecision.provider === 'nodemailer' && rateLimiterService) {
      const rateLimitCheck = await rateLimiterService.canSend(domain);
      
      if (!rateLimitCheck.canSend) {
        // At rate limit - delay until next hour
        const delayMs = rateLimitCheck.timeUntilReset + 60000; // Add 1 minute buffer
        console.warn(
          `[RateLimiter] Domain ${domain} has reached hourly limit (${rateLimitCheck.currentCount}/${rateLimitCheck.limit}). ` +
          `Delaying email for ${Math.round(delayMs / 60000)} minutes until limit resets.`
        );
        
        // Update email_queue status to show it's delayed due to rate limit
        if (finalEmailQueueId) {
          await pool.query(
            `UPDATE email_queue 
             SET status = 'queued', 
                 error_message = $1
             WHERE id = $2`,
            [
              `Rate limit reached: ${rateLimitCheck.currentCount}/${rateLimitCheck.limit} emails/hour. Will retry after limit resets.`,
              finalEmailQueueId
            ]
          );
        }
        
        await job.moveToDelayed(Date.now() + delayMs);
        return;
      }
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
    // Wrap in try-catch so tracking failures don't break email sending
    let trackedContent = content;
    let trackingToken: string | null = null;

    if (finalEmailQueueId) {
      try {
        // Generate tracking token
        trackingToken = generateTrackingToken(finalEmailQueueId, contactId);
        
        // Store tracking token
        await storeTrackingToken(finalEmailQueueId, contactId, campaignId, trackingToken);
        
        // Add tracking pixel
        const pixelUrl = getTrackingPixelUrl(trackingToken);
        trackedContent = addTrackingPixel(trackedContent, pixelUrl);
        
        // Wrap links with tracking
        const originalLinkCount = (trackedContent.match(/<a\s+[^>]*href\s*=/gi) || []).length;
        trackedContent = wrapLinksWithTracking(trackedContent, trackingToken);
        const trackedLinkCount = (trackedContent.match(/\/api\/tracking\/click\//g) || []).length;
        
        // Log tracking setup for debugging
        console.log(`[Tracking] Email ${finalEmailQueueId} tracking setup:`, {
          emailQueueId: finalEmailQueueId,
          contactId,
          campaignId,
          token: trackingToken.substring(0, 8) + '...',
          pixelUrl: pixelUrl.substring(0, 60) + '...',
          linksFound: originalLinkCount,
          linksTracked: trackedLinkCount,
          hasTrackingPixel: trackedContent.includes(pixelUrl),
        });
      } catch (trackingError: any) {
        // Log error but continue with untracked content - don't break email sending
        console.error(`[Tracking] Failed to add tracking to email ${finalEmailQueueId}:`, trackingError.message);
        console.error(`[Tracking] Email will be sent without tracking. Error:`, trackingError);
        // Use original content without tracking
        trackedContent = content;
      }
    } else {
      console.warn(`[Tracking] WARNING: No emailQueueId available for tracking - email to ${toEmail} will not be tracked!`);
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

    // Record rate limit send (for Nodemailer/SMTP providers)
    if (routingDecision.provider === 'nodemailer' && rateLimiterService) {
      await rateLimiterService.recordSend(domain);
    }

    return result;
  } catch (error: any) {
    console.error('Email send error:', error);

    // Check if this is a rate limit error (for Nodemailer/SMTP providers)
    const isRateLimitError = routingDecision && routingDecision.provider === 'nodemailer' && 
      ((error as any).isRateLimitError ||
       error.message?.toLowerCase().includes('exceeded') || 
       error.message?.toLowerCase().includes('rate limit') ||
       error.message?.toLowerCase().includes('max emails per hour') ||
       error.message?.toLowerCase().includes('too many emails') ||
       error.message?.toLowerCase().includes('quota exceeded') ||
       (error as any).responseCode === 421 || // SMTP code for service not available (often used for rate limits)
       (error as any).responseCode === 450);  // SMTP code for mailbox unavailable (sometimes used for rate limits)

    if (isRateLimitError && rateLimiterService && domain) {
      // Rate limit hit - update our tracker and delay the email
      
      // Mark that we've hit the limit (set count to limit to prevent immediate retries)
      try {
        const redis = await import('../services/redis').then(m => m.getRedisClient());
        const now = new Date();
        const hourKey = now.toISOString().split(':')[0];
        const redisKey = `rate_limit:${domain}:${hourKey}`;
        
        // Set count to limit to prevent further sends this hour
        await redis.set(redisKey, '60'); // Hard limit reached
        await redis.expire(redisKey, 7200);
        
        console.warn(`[RateLimiter] Rate limit error detected for domain ${domain}. Marking limit as reached.`);
      } catch (redisError: any) {
        console.error(`[RateLimiter] Failed to update rate limit tracker:`, redisError?.message || redisError);
      }

      // Calculate delay until next hour
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1);
      nextHour.setMinutes(0);
      nextHour.setSeconds(0);
      nextHour.setMilliseconds(0);
      const delayMs = nextHour.getTime() - now.getTime() + 60000; // Add 1 minute buffer

      // Update email_queue status
      if (finalEmailQueueId) {
        await pool.query(
          `UPDATE email_queue 
           SET status = 'queued', 
               error_message = $1
           WHERE id = $2`,
          [
            `Rate limit exceeded: Domain ${domain} has reached hourly sending limit. Will retry after limit resets.`,
            finalEmailQueueId
          ]
        );
      }

      // Delay the job
      await job.moveToDelayed(Date.now() + delayMs);
      console.warn(
        `[RateLimiter] Rate limit error for domain ${domain}. Delaying email for ${Math.round(delayMs / 60000)} minutes.`
      );
      return; // Don't mark as failed, just delay
    }

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

