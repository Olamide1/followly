import Queue from 'bull';
import Redis from 'ioredis';
// Note: Processor functions are imported and registered in workers/index.ts
// They are NOT imported here to avoid duplicate processor registration

let emailQueue: Queue.Queue | null = null;
// let automationQueue: Queue.Queue | null = null; // DISABLED: Temporarily commented out
let schedulingQueue: Queue.Queue | null = null;
let campaignSendQueue: Queue.Queue | null = null;
let contactImportQueue: Queue.Queue | null = null;

// Shared Redis connection instances for all Bull queues
// CRITICAL: Using shared ioredis instances via createClient reduces connections from ~19 to ~3
// Heroku Redis has a strict 18 connection limit
// Bull v4 requires separate instances for "client" and "subscriber", but they can be shared across queues
let sharedRedisClient: Redis | null = null;
let sharedRedisSubscriber: Redis | null = null;

/**
 * Create shared Redis connection instances for Bull queues
 * This is the ONLY way to truly share connections in Bull v4 - using createClient option
 * Reduces Redis connections from ~19 (4 queues × ~4-5 connections each) to ~3 total
 */
function createSharedRedisConnections(): { client: Redis; subscriber: Redis } {
  if (sharedRedisClient && sharedRedisSubscriber) {
    return { client: sharedRedisClient, subscriber: sharedRedisSubscriber };
  }

  // Use REDIS_URL directly - ioredis can parse it properly
  // Heroku automatically sets REDIS_URL with the full connection string
  const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
  
  // Validate REDIS_URL is present
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    console.error('[Bull Redis] ERROR: No REDIS_URL or REDIS_HOST found in environment variables');
    throw new Error('Redis configuration missing: REDIS_URL or REDIS_HOST must be set');
  }
  
  // ioredis can accept a URL string directly - this is the safest approach
  // It handles TLS, passwords, and all connection details automatically
  const config: any = {
    // Pass the full URL string - ioredis will parse it correctly
    // This works for both rediss:// (TLS) and redis:// URLs
    ...(redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://') 
      ? { 
          // For URL strings, ioredis handles parsing automatically
          // But we need to ensure TLS settings for Heroku Redis
          ...(redisUrl.startsWith('rediss://') ? {
            tls: {
              rejectUnauthorized: false, // Required for Heroku Redis self-signed certs
            }
          } : {}),
        }
      : {
          // Fallback for non-URL format (host/port only)
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        }
    ),
    retryStrategy: (times: number) => {
      if (times > 10) {
        console.error('[Bull Redis] Max reconnection attempts reached, stopping retry');
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      console.log(`[Bull Redis] Reconnecting... attempt ${times} (delay: ${delay}ms)`);
      return delay;
    },
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    lazyConnect: false,
    keepAlive: 30000,
    enableReadyCheck: false,
  };

  // Create shared client (for commands) - can be shared across all queues
  // ioredis accepts URL string as first argument, or config object
  sharedRedisClient = redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://')
    ? new Redis(redisUrl, config) // Pass URL string + config for TLS settings
    : new Redis(config); // Use config object for host/port format
  
  sharedRedisClient.on('ready', () => {
    console.log('✅ Shared Redis client ready (shared across all queues)');
  });
  sharedRedisClient.on('error', (err) => {
    console.error('[Bull Redis Client] Error:', err?.message || err);
  });
  sharedRedisClient.on('connect', () => {
    console.log('[Bull Redis Client] Connecting...');
  });

  // Create shared subscriber (for pub/sub) - can be shared across all queues
  sharedRedisSubscriber = redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://')
    ? new Redis(redisUrl, config) // Pass URL string + config for TLS settings
    : new Redis(config); // Use config object for host/port format
  
  sharedRedisSubscriber.on('ready', () => {
    console.log('✅ Shared Redis subscriber ready (shared across all queues)');
  });
  sharedRedisSubscriber.on('error', (err) => {
    console.error('[Bull Redis Subscriber] Error:', err?.message || err);
  });
  sharedRedisSubscriber.on('connect', () => {
    console.log('[Bull Redis Subscriber] Connecting...');
  });

  console.log(`✅ Shared Redis connections created using REDIS_URL (all queues will share these)`);
  
  return { client: sharedRedisClient, subscriber: sharedRedisSubscriber };
}

/**
 * Get Redis config for creating new connections (used for bclient)
 * Returns config that can be passed to new Redis() constructor
 */
function getRedisConfigForNewConnection(): any {
  const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
  
  // If we have a URL string, return it with TLS config
  if (redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://')) {
    return {
      // ioredis will parse the URL string automatically
      // We just need to add TLS config for rediss://
      ...(redisUrl.startsWith('rediss://') ? {
        tls: { rejectUnauthorized: false },
      } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
  
  // Fallback for host/port format
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/**
 * Get Bull queue options with shared Redis connections
 * Uses createClient to force Bull to reuse the same ioredis instances
 * This reduces connections from ~19 to ~3 (1 client + 1 subscriber + occasional bclient)
 */
function getQueueOptions() {
  const { client, subscriber } = createSharedRedisConnections();
  const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
  const bclientConfig = getRedisConfigForNewConnection();
  
  console.log('[Queue Options] Creating queue options with shared Redis connections');
  console.log('[Queue Options] Redis URL:', redisUrl ? `${redisUrl.substring(0, 20)}...` : 'not set');
  console.log('[Queue Options] Shared client status:', client?.status || 'unknown');
  console.log('[Queue Options] Shared subscriber status:', subscriber?.status || 'unknown');
  
  return {
    createClient: (type: 'client' | 'subscriber' | 'bclient', redisOpts?: any) => {
      console.log(`[Queue Options] createClient called for type: ${type}`);
      switch (type) {
        case 'client':
          // Shared client for all queues - reduces connections dramatically
          console.log(`[Queue Options] Returning shared client (status: ${client?.status})`);
          return client;
        case 'subscriber':
          // Shared subscriber for all queues - reduces connections dramatically
          console.log(`[Queue Options] Returning shared subscriber (status: ${subscriber?.status})`);
          return subscriber;
        case 'bclient':
          // Blocking client - cannot be shared, must create new instance
          // But this is only used temporarily for blocking operations, so minimal impact
          // Use URL string if available, otherwise use config object
          console.log(`[Queue Options] Creating new bclient (blocking client)`);
          if (redisUrl.startsWith('rediss://') || redisUrl.startsWith('redis://')) {
            return new Redis(redisUrl, { ...bclientConfig, ...redisOpts });
          }
          return new Redis({ ...bclientConfig, ...redisOpts });
        default:
          console.log(`[Queue Options] Unknown type ${type}, returning shared client`);
          return client;
      }
    },
  };
}

// Legacy function for backward compatibility
export function getRedisConfig() {
  // Return the shared client for any code that still uses this
  const { client } = createSharedRedisConnections();
  return client;
}

export async function initializeQueues(): Promise<void> {
  try {
    // Get shared queue options with connection sharing
    const queueOptions = getQueueOptions();

    // Create queues with shared Redis connections via createClient
    // This reduces connections from ~19 to ~3 (1 client + 1 subscriber + occasional bclient)
    emailQueue = new Queue('email', { 
      ...queueOptions,
      // Optimize connection usage
      settings: {
        // Reduce connection overhead by using fewer connections per queue
        lockDuration: 15000, // 15 seconds - faster detection of stuck jobs
        lockRenewTime: 12000, // Renew lock every 12 seconds (reduces overhead, must be < lockDuration)
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds (faster detection)
        maxStalledCount: 2, // Retry stalled jobs twice (more retries for stuck emails)
      },
      // CRITICAL: Cleanup old jobs to prevent Redis memory issues
      // Keep only last 50 completed jobs, remove older ones automatically
      // Note: Bull v4 doesn't support 'timeout' in defaultJobOptions - timeout is handled in emailWorker.ts
      defaultJobOptions: {
        removeOnComplete: {
          age: 1800, // Remove completed jobs older than 30 minutes (more aggressive)
          count: 50, // Keep max 50 completed jobs (reduced from 100)
        },
        removeOnFail: {
          age: 86400, // Remove failed jobs older than 1 day (more aggressive - was 7 days)
          count: 500, // Keep max 500 failed jobs (reduced from 1000)
        },
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 second delay
        },
      },
    });
    // automationQueue = new Queue('automation', queueOptions); // DISABLED: Temporarily commented out
    schedulingQueue = new Queue('scheduling', {  
      ...queueOptions,
      settings: {
        lockDuration: 30000,
        lockRenewTime: 25000, // Renew lock every 25 seconds (reduces overhead)
        stalledInterval: 60000, // Check for stalled jobs every 60 seconds (reduces checks)
        maxStalledCount: 1,
      },
      // CRITICAL: Cleanup old jobs to prevent Redis memory issues
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Remove completed jobs older than 1 hour
          count: 50, // Keep max 50 completed jobs
        },
        removeOnFail: {
          age: 86400 * 7, // Remove failed jobs older than 7 days
          count: 500, // Keep max 500 failed jobs for debugging
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    console.log('[Queue Init] Creating campaign-send queue with shared Redis connections...');
    campaignSendQueue = new Queue('campaign-send', {
      ...queueOptions,
      settings: {
        lockDuration: 300000, // 5 minutes - campaign sends can take longer
        lockRenewTime: 60000, // Renew lock every minute
        stalledInterval: 60000, // Check for stalled jobs every 60 seconds (reduces checks)
        maxStalledCount: 1,
      },
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Remove completed jobs older than 1 hour
          count: 50,
        },
        removeOnFail: {
          age: 86400 * 7, // Remove failed jobs older than 7 days
          count: 500,
        },
        attempts: 2, // Campaign sends are less critical to retry (contacts are already queued)
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    contactImportQueue = new Queue('contact-import', {
      ...queueOptions,
      settings: {
        lockDuration: 600000, // 10 minutes - contact imports can take a while
        lockRenewTime: 120000, // Renew lock every 2 minutes
        stalledInterval: 60000, // Check for stalled jobs every 60 seconds (reduces checks)
        maxStalledCount: 1,
      },
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Remove completed jobs older than 1 hour
          count: 50,
        },
        removeOnFail: {
          age: 86400 * 7, // Remove failed jobs older than 7 days
          count: 500,
        },
        attempts: 2, // Retry failed imports once
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    // Add error handlers for better debugging
    emailQueue.on('error', (error) => {
      console.error('Email queue error:', error);
    });
    
    campaignSendQueue.on('error', (error) => {
      console.error('Campaign send queue error:', error);
    });
    
    campaignSendQueue.on('waiting', (jobId) => {
      console.log(`[Campaign Send Queue] Job ${jobId} is waiting`);
    });
    
    campaignSendQueue.on('active', (job) => {
      console.log(`[Campaign Send Queue] Job ${job.id} is now active (campaign ${job.data.campaignId})`);
    });
    
    campaignSendQueue.on('completed', (job) => {
      console.log(`[Campaign Send Queue] Job ${job.id} completed (campaign ${job.data.campaignId})`);
    });
    
    campaignSendQueue.on('failed', (job, err) => {
      console.error(`[Campaign Send Queue] Job ${job?.id} failed (campaign ${job?.data?.campaignId}):`, err?.message || err);
    });
    
    emailQueue.on('failed', async (job, err) => {
      console.error(`Email job ${job?.id} failed:`, err?.message || err);
      // Mark email as failed in database if job data is available
      await markEmailAsFailed(job);
    });
    
    // Handle stalled jobs (jobs that exceeded lockDuration)
    // This prevents emails from being stuck in "sending" state
    emailQueue.on('stalled', async (jobId: Queue.JobId) => {
      console.warn(`[Email Queue] Job ${jobId} stalled (exceeded lock duration)`);
      try {
        const job = await emailQueue!.getJob(jobId);
        if (job) {
          await markEmailAsFailed(job);
          // Move to failed queue
          await job.moveToFailed(new Error('Job stalled - exceeded lock duration'), true);
        }
      } catch (error: any) {
        console.error(`[Email Queue] Failed to handle stalled job ${jobId}:`, error?.message || error);
      }
    });
    
    schedulingQueue.on('error', (error) => {
      console.error('Scheduling queue error:', error);
    });

    schedulingQueue.on('failed', (job, err) => {
      console.error(`Scheduling job ${job?.id} failed:`, err?.message || err);
    });

    campaignSendQueue.on('error', (error) => {
      console.error('[Campaign Send Queue] ❌ Queue error:', error?.message || error);
    });
    
    campaignSendQueue.on('waiting', (jobId) => {
      console.log(`[Campaign Send Queue] ⏳ Job ${jobId} is waiting in queue`);
    });
    
    campaignSendQueue.on('active', (job) => {
      console.log(`[Campaign Send Queue] 🚀 Job ${job.id} is now active (campaign ${job.data.campaignId}, user ${job.data.userId})`);
    });
    
    campaignSendQueue.on('completed', (job) => {
      console.log(`[Campaign Send Queue] ✅ Job ${job.id} completed successfully (campaign ${job.data.campaignId})`);
    });

    campaignSendQueue.on('failed', (job, err) => {
      console.error(`[Campaign Send Queue] ❌ Job ${job?.id} failed (campaign ${job?.data?.campaignId}):`, {
        error: err?.message || err,
        stack: err?.stack,
      });
    });
    
    campaignSendQueue.on('stalled', (jobId) => {
      console.warn(`[Campaign Send Queue] ⚠️ Job ${jobId} stalled (exceeded lock duration)`);
    });

    contactImportQueue.on('error', (error) => {
      console.error('Contact import queue error:', error);
    });

    contactImportQueue.on('failed', (job, err) => {
      console.error(`Contact import job ${job?.id} failed:`, err?.message || err);
    });

    // Wait for queues to be ready before processing
    console.log('[Queue Init] Waiting for all queues to be ready...');
    const readyResults = await Promise.all([
      emailQueue.isReady().then(() => ({ queue: 'email', ready: true })).catch(() => ({ queue: 'email', ready: false })),
      schedulingQueue.isReady().then(() => ({ queue: 'scheduling', ready: true })).catch(() => ({ queue: 'scheduling', ready: false })),
      campaignSendQueue.isReady().then(() => ({ queue: 'campaign-send', ready: true })).catch(() => ({ queue: 'campaign-send', ready: false })),
      contactImportQueue.isReady().then(() => ({ queue: 'contact-import', ready: true })).catch(() => ({ queue: 'contact-import', ready: false })),
    ]);
    
    console.log('[Queue Init] Queue ready status:', readyResults);
    
    // Verify campaign send queue specifically
    if (campaignSendQueue) {
      try {
        const counts = await campaignSendQueue.getJobCounts();
        console.log('[Queue Init] Campaign send queue initial counts:', counts);
        
        // If there are failed jobs, log their details to help debug
        if (counts.failed > 0) {
          console.log(`[Queue Init] ⚠️ Found ${counts.failed} failed campaign send jobs. Inspecting...`);
          try {
            const failedJobs = await campaignSendQueue.getFailed(0, Math.min(counts.failed, 5));
            for (const job of failedJobs) {
              try {
                const failedReason = await job.failedReason;
                const stacktrace = await job.stacktrace;
                console.error(`[Queue Init] Failed job ${job.id}:`, {
                  data: job.data,
                  failedReason: failedReason || 'No reason',
                  stacktrace: stacktrace || 'No stacktrace',
                  attemptsMade: job.attemptsMade,
                  timestamp: job.timestamp,
                });
              } catch (jobError: any) {
                console.error(`[Queue Init] Could not get details for failed job ${job.id}:`, jobError?.message || jobError);
              }
            }
          } catch (failedError: any) {
            console.error('[Queue Init] Could not retrieve failed jobs:', failedError?.message || failedError);
          }
        }
      } catch (error: any) {
        console.error('[Queue Init] Could not get campaign send queue counts:', error?.message || error);
      }
    }

    console.log('✅ Redis connection ready');

    // Start periodic cleanup of old jobs to prevent Redis memory issues
    // This runs every 30 minutes to clean up any jobs that weren't auto-removed
    startQueueCleanup();
    
    // Start periodic recovery of stuck emails
    // This runs every 10 minutes to find and recover emails stuck in "sending" state
    startStuckEmailRecovery();

    // Start periodic reputation calculation
    // This runs every hour to update domain reputation scores and auto-pause if needed
    startReputationCalculation();

    // Note: Processors are NOT registered here to avoid duplicate registration
    // The worker dyno (workers/index.ts) is responsible for registering processors
    // This ensures jobs are only processed once, avoiding race conditions

    console.log('✅ Queues initialized');
  } catch (error) {
    console.error('Queue initialization error:', error);
    throw error;
  }
}

/**
 * Mark email as failed in database when BullMQ job fails or stalls
 * This ensures emails don't get stuck in "sending" state
 */
async function markEmailAsFailed(job: Queue.Job): Promise<void> {
  try {
    const { emailQueueId, contactId, campaignId, automationId } = job.data || {};
    
    if (!emailQueueId) {
      // Try to find email by other identifiers
      const { pool } = await import('../database/connection');
      
      let whereClause: string;
      const params: any[] = [];
      let paramIndex = 1;
      
      if (contactId) {
        params.push(contactId);
        whereClause = `contact_id = $${paramIndex}`;
        paramIndex++;
        
        if (campaignId) {
          params.push(campaignId);
          whereClause += ` AND campaign_id = $${paramIndex}`;
          paramIndex++;
        } else if (automationId) {
          params.push(automationId);
          whereClause += ` AND automation_id = $${paramIndex}`;
          paramIndex++;
        }
        
        // Only update if status is still 'sending' or 'queued' (not already sent/failed)
        whereClause += ` AND status IN ('sending', 'queued')`;
        
        await pool.query(
          `UPDATE email_queue 
           SET status = 'failed', 
               error_message = 'Job stalled or failed in queue',
               retry_count = retry_count + 1
           WHERE id = (
             SELECT id FROM email_queue
             WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT 1
           )`,
          params
        );
        
        console.log(`[Queue] Marked email as failed (stalled job): contactId=${contactId}, campaignId=${campaignId || 'null'}`);
      }
    } else {
      // Direct update by emailQueueId
      const { pool } = await import('../database/connection');
      await pool.query(
        `UPDATE email_queue 
         SET status = 'failed', 
             error_message = COALESCE(error_message, 'Job stalled or failed in queue'),
             retry_count = retry_count + 1
         WHERE id = $1 AND status IN ('sending', 'queued')`,
        [emailQueueId]
      );
      
      console.log(`[Queue] Marked email ${emailQueueId} as failed (stalled job)`);
    }
  } catch (error: any) {
    // Don't throw - this is a cleanup operation
    console.error('[Queue] Failed to mark email as failed:', error?.message || error);
  }
}

/**
 * Recover stuck emails in "sending" state
 * Runs periodically to find emails that have been stuck for too long
 */
async function recoverStuckEmails(): Promise<void> {
  try {
    const { pool } = await import('../database/connection');
    
    // Find emails stuck in "sending" state for more than 5 minutes
    // (lockDuration is 30 seconds, so 5 minutes is very safe)
    const result = await pool.query(
      `UPDATE email_queue 
       SET status = 'failed', 
           error_message = 'Email job timed out - no response from worker',
           retry_count = retry_count + 1
       WHERE status = 'sending' 
         AND created_at < NOW() - INTERVAL '5 minutes'
       RETURNING id, contact_id, campaign_id`,
      []
    );
    
    if (result.rows.length > 0) {
      console.log(`[Queue Recovery] Recovered ${result.rows.length} stuck emails from "sending" state`);
    }
  } catch (error: any) {
    console.error('[Queue Recovery] Failed to recover stuck emails:', error?.message || error);
  }
}

/**
 * Aggressive immediate cleanup of old BullMQ jobs
 * Removes ALL completed jobs and old failed jobs to free up Redis memory
 * Use this when Redis is hitting memory limits
 */
export async function aggressiveQueueCleanup(): Promise<{ email: { completed: number; failed: number }; scheduling: { completed: number; failed: number } }> {
  const result = {
    email: { completed: 0, failed: 0 },
    scheduling: { completed: 0, failed: 0 },
  };
  
  try {
    if (emailQueue) {
      // Remove ALL completed jobs (keep 0, age 0 = remove all)
      const cleanedCompleted = await emailQueue.clean(0, 'completed', 0);
      // Remove failed jobs older than 1 day (more aggressive)
      const cleanedFailed = await emailQueue.clean(86400 * 1000, 'failed', 100);
      result.email.completed = cleanedCompleted.length;
      result.email.failed = cleanedFailed.length;
      console.log(`[Aggressive Cleanup] Email queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
    }
    
    if (schedulingQueue) {
      const cleanedCompleted = await schedulingQueue.clean(0, 'completed', 0);
      const cleanedFailed = await schedulingQueue.clean(86400 * 1000, 'failed', 50);
      result.scheduling.completed = cleanedCompleted.length;
      result.scheduling.failed = cleanedFailed.length;
      console.log(`[Aggressive Cleanup] Scheduling queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
    }
  } catch (error: any) {
    console.error('[Aggressive Cleanup] Error:', error?.message || error);
    throw error;
  }
  
  return result;
}

/**
 * Periodic cleanup of old BullMQ jobs to prevent Redis memory issues
 * Runs every 30 minutes to clean up completed/failed jobs
 */
function startQueueCleanup(): void {
  // Run cleanup every 10 minutes (more frequent to reduce Redis usage)
  const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
  
  const cleanup = async () => {
    try {
      if (emailQueue) {
        // Clean up completed jobs older than 30 minutes (more aggressive)
        const cleanedCompleted = await emailQueue.clean(1800 * 1000, 'completed', 50);
        // Clean up failed jobs older than 1 day (more aggressive - was 7 days)
        const cleanedFailed = await emailQueue.clean(86400 * 1000, 'failed', 500);
        if (cleanedCompleted.length > 0 || cleanedFailed.length > 0) {
          console.log(`[Queue Cleanup] Email queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
        }
      }
      
      if (schedulingQueue) {
        const cleanedCompleted = await schedulingQueue.clean(1800 * 1000, 'completed', 25);
        const cleanedFailed = await schedulingQueue.clean(86400 * 1000, 'failed', 250);
        if (cleanedCompleted.length > 0 || cleanedFailed.length > 0) {
          console.log(`[Queue Cleanup] Scheduling queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
        }
      }
      
      // Also clean campaign-send and contact-import queues
      if (campaignSendQueue) {
        const cleanedCompleted = await campaignSendQueue.clean(1800 * 1000, 'completed', 25);
        const cleanedFailed = await campaignSendQueue.clean(86400 * 1000, 'failed', 250);
        if (cleanedCompleted.length > 0 || cleanedFailed.length > 0) {
          console.log(`[Queue Cleanup] Campaign-send queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
        }
      }
      
      if (contactImportQueue) {
        const cleanedCompleted = await contactImportQueue.clean(1800 * 1000, 'completed', 25);
        const cleanedFailed = await contactImportQueue.clean(86400 * 1000, 'failed', 250);
        if (cleanedCompleted.length > 0 || cleanedFailed.length > 0) {
          console.log(`[Queue Cleanup] Contact-import queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
        }
      }
    } catch (error: any) {
      // Don't throw - cleanup failures shouldn't crash the app
      console.error('[Queue Cleanup] Error during cleanup:', error?.message || error);
    }
  };
  
  // Run aggressive cleanup immediately on startup to clear existing old jobs
  // This helps when Redis is already at memory limit
  aggressiveQueueCleanup().catch((err) => {
    console.error('[Startup Cleanup] Failed to run aggressive cleanup:', err?.message || err);
    // Fall back to regular cleanup if aggressive fails
    cleanup();
  });
  
  // Then run regular cleanup every 10 minutes
  setInterval(cleanup, CLEANUP_INTERVAL);
  
  console.log('✅ Queue cleanup scheduled (aggressive on startup, then every 10 minutes)');
}

/**
 * Recover stuck campaigns in "sending" state
 * Finds campaigns that have been stuck for more than 10 minutes with no emails queued
 */
async function recoverStuckCampaigns(): Promise<void> {
  try {
    const { pool } = await import('../database/connection');
    
    // Find campaigns stuck in "sending" state for more than 10 minutes
    // with no pending/queued/sending emails
    const result = await pool.query(
      `UPDATE campaigns c
       SET status = 'draft'
       WHERE c.status = 'sending'
         AND c.updated_at < NOW() - INTERVAL '10 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM email_queue eq
           WHERE eq.campaign_id = c.id
             AND eq.status IN ('pending', 'queued', 'sending')
         )
       RETURNING c.id, c.name, c.user_id`,
      []
    );
    
    if (result.rows.length > 0) {
      console.log(`[Campaign Recovery] Recovered ${result.rows.length} stuck campaigns from "sending" state`);
      result.rows.forEach((row: any) => {
        console.log(`[Campaign Recovery] Reset campaign ${row.id} (${row.name}) for user ${row.user_id}`);
      });
    }
  } catch (error: any) {
    console.error('[Campaign Recovery] Failed to recover stuck campaigns:', error?.message || error);
  }
}

/**
 * Periodic recovery of stuck emails in "sending" state
 * Runs every 10 minutes to find emails that have been stuck for too long
 */
function startStuckEmailRecovery(): void {
  const RECOVERY_INTERVAL = 10 * 60 * 1000; // 10 minutes
  
  // Run recovery immediately, then every 10 minutes
  recoverStuckEmails();
  recoverStuckCampaigns(); // Also recover stuck campaigns
  setInterval(() => {
    recoverStuckEmails();
    recoverStuckCampaigns();
  }, RECOVERY_INTERVAL);
  
  console.log('✅ Stuck email recovery scheduled (runs every 10 minutes)');
  console.log('✅ Stuck campaign recovery scheduled (runs every 10 minutes)');
}

/**
 * Periodic reputation calculation for all domains
 * Runs every hour to update reputation scores and auto-pause if needed
 */
function startReputationCalculation(): void {
  const REPUTATION_INTERVAL = 60 * 60 * 1000; // 1 hour
  
  const calculateReputations = async () => {
    try {
      const { DomainReputationService } = await import('./domainReputation');
      const reputationService = new DomainReputationService();
      const { pool } = await import('../database/connection');
      
      // Get all unique user_id and domain combinations
      const domainsResult = await pool.query(
        `SELECT DISTINCT user_id, 
         SUBSTRING(from_email FROM '@(.*)$')::text as domain
         FROM provider_configs 
         WHERE is_active = true AND from_email IS NOT NULL`
      );
      
      for (const row of domainsResult.rows) {
        try {
          await reputationService.calculateReputation(row.user_id, row.domain);
        } catch (error: any) {
          console.error(`[Reputation] Failed to calculate reputation for domain ${row.domain}:`, error?.message || error);
        }
      }
      
      console.log(`[Reputation] Calculated reputation for ${domainsResult.rows.length} domains`);
    } catch (error: any) {
      console.error('[Reputation] Error during reputation calculation:', error?.message || error);
    }
  };
  
  // Run immediately, then every hour
  calculateReputations();
  setInterval(calculateReputations, REPUTATION_INTERVAL);
  
  console.log('✅ Reputation calculation scheduled (runs every hour)');
}

export function getEmailQueue() {
  if (!emailQueue) {
    throw new Error('Email queue not initialized');
  }
  return emailQueue;
}

// DISABLED: Temporarily commented out
// export function getAutomationQueue() {
//   if (!automationQueue) {
//     throw new Error('Automation queue not initialized');
//   }
//   return automationQueue;
// }

export function getSchedulingQueue() {
  if (!schedulingQueue) {
    throw new Error('Scheduling queue not initialized');
  }
  return schedulingQueue;
}

export function getCampaignSendQueue() {
  if (!campaignSendQueue) {
    throw new Error('Campaign send queue not initialized');
  }
  return campaignSendQueue;
}

export function getContactImportQueue() {
  if (!contactImportQueue) {
    throw new Error('Contact import queue not initialized');
  }
  return contactImportQueue;
}

/**
 * Pause email queue processing (stops processing new jobs immediately)
 * Active jobs will complete, but no new jobs will be processed
 */
export async function pauseEmailQueue(): Promise<void> {
  if (!emailQueue) {
    throw new Error('Email queue not initialized');
  }
  await emailQueue.pause();
  console.log('⏸️  Email queue paused - no new emails will be processed');
}

/**
 * Resume email queue processing
 */
export async function resumeEmailQueue(): Promise<void> {
  if (!emailQueue) {
    throw new Error('Email queue not initialized');
  }
  await emailQueue.resume();
  console.log('▶️  Email queue resumed - emails will be processed');
}

/**
 * Check if email queue is paused
 */
export async function isEmailQueuePaused(): Promise<boolean> {
  if (!emailQueue) {
    return false;
  }
  return emailQueue.isPaused();
}

/**
 * Get job counts for all queues
 */
export async function getQueueJobCounts(): Promise<{
  email: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  campaignSend: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  scheduling: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  contactImport: { waiting: number; active: number; completed: number; failed: number; delayed: number };
}> {
  const getCounts = async (queue: Queue.Queue | null) => {
    if (!queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
    try {
      const counts = await queue.getJobCounts();
      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (error: any) {
      console.error('[Queue] Error getting job counts:', error?.message || error);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  };

  return {
    email: await getCounts(emailQueue),
    campaignSend: await getCounts(campaignSendQueue),
    scheduling: await getCounts(schedulingQueue),
    contactImport: await getCounts(contactImportQueue),
  };
}

