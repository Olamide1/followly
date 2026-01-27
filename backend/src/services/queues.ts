import Queue from 'bull';
// Note: Processor functions are imported and registered in workers/index.ts
// They are NOT imported here to avoid duplicate processor registration

let emailQueue: Queue.Queue | null = null;
// let automationQueue: Queue.Queue | null = null; // DISABLED: Temporarily commented out
let schedulingQueue: Queue.Queue | null = null;

// Parse Redis URL and configure for Heroku TLS
// This function is exported so it can be shared across the application
// Using a shared config ensures both web and worker dynos use the same connection settings,
// which helps optimize Redis connection usage (Heroku Redis has a 18 connection limit)
export function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // If using rediss:// (TLS) or in production, configure TLS
  if (redisUrl.startsWith('rediss://') || (isProduction && redisUrl.startsWith('redis://'))) {
    // Normalize rediss:// to redis:// for URL parsing, then configure TLS
    const normalizedUrl = redisUrl.replace('rediss://', 'redis://');
    const url = new URL(normalizedUrl);
    const password = url.password || undefined;
    const host = url.hostname;
    const port = parseInt(url.port || '6379');
    
    return {
      host,
      port,
      password,
      tls: {
        rejectUnauthorized: false, // Required for Heroku Redis self-signed certs
      },
      // Optimize connection usage: Bull will create fewer connections with these settings
      // Note: Bull doesn't allow enableReadyCheck or maxRetriesPerRequest
      // These are handled internally by Bull
      retryStrategy: (times: number) => {
        // Exponential backoff with max delay
        // After 10 attempts, stop retrying to prevent infinite loops
        if (times > 10) {
          console.error('[BullMQ Redis] Max reconnection attempts reached, stopping retry');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        console.log(`[BullMQ Redis] Reconnecting... attempt ${times} (delay: ${delay}ms)`);
        return delay;
      },
      enableOfflineQueue: true, // Queue commands while reconnecting
      // Connection optimization: Bull uses ioredis which supports connection pooling
      // maxRetriesPerRequest: null allows ioredis to manage retries more efficiently
      maxRetriesPerRequest: null, // Disable automatic retries (Bull handles retries)
      connectTimeout: 10000, // 10 second connection timeout
      lazyConnect: false, // Connect immediately
      keepAlive: 30000, // Send keepalive every 30 seconds
    };
  }
  
  // For local development without TLS
  return redisUrl;
}

export async function initializeQueues(): Promise<void> {
  try {
    const redisConfig = getRedisConfig();

    // Create queues with optimized connection settings and cleanup policies
    // Bull will share connections more efficiently when using the same config
    emailQueue = new Queue('email', { 
      redis: redisConfig,
      // Optimize connection usage
      settings: {
        // Reduce connection overhead by using fewer connections per queue
        lockDuration: 30000, // 30 seconds
        lockRenewTime: 15000, // Renew lock every 15 seconds
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        maxStalledCount: 1, // Retry stalled jobs once
      },
      // CRITICAL: Cleanup old jobs to prevent Redis memory issues
      // Keep only last 100 completed jobs, remove older ones automatically
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // Remove completed jobs older than 1 hour (3600 seconds)
          count: 100, // Keep max 100 completed jobs
        },
        removeOnFail: {
          age: 86400 * 7, // Remove failed jobs older than 7 days
          count: 1000, // Keep max 1000 failed jobs for debugging
        },
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 second delay
        },
      },
    });
    // automationQueue = new Queue('automation', { redis: redisConfig }); // DISABLED: Temporarily commented out
    schedulingQueue = new Queue('scheduling', { 
      redis: redisConfig,
      settings: {
        lockDuration: 30000,
        lockRenewTime: 15000,
        stalledInterval: 30000,
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

    // Add error handlers for better debugging
    emailQueue.on('error', (error) => {
      console.error('Email queue error:', error);
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

    // Wait for queues to be ready before processing
    await Promise.all([
      emailQueue.isReady(),
      schedulingQueue.isReady(),
    ]);

    console.log('✅ Redis connection ready');

    // Start periodic cleanup of old jobs to prevent Redis memory issues
    // This runs every 30 minutes to clean up any jobs that weren't auto-removed
    startQueueCleanup();
    
    // Start periodic recovery of stuck emails
    // This runs every 10 minutes to find and recover emails stuck in "sending" state
    startStuckEmailRecovery();

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
  // Run cleanup every 30 minutes
  const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds
  
  const cleanup = async () => {
    try {
      if (emailQueue) {
        // Clean up completed jobs older than 1 hour
        const cleanedCompleted = await emailQueue.clean(3600 * 1000, 'completed', 100);
        // Clean up failed jobs older than 7 days
        const cleanedFailed = await emailQueue.clean(86400 * 7 * 1000, 'failed', 1000);
        if (cleanedCompleted.length > 0 || cleanedFailed.length > 0) {
          console.log(`[Queue Cleanup] Email queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
        }
      }
      
      if (schedulingQueue) {
        const cleanedCompleted = await schedulingQueue.clean(3600 * 1000, 'completed', 50);
        const cleanedFailed = await schedulingQueue.clean(86400 * 7 * 1000, 'failed', 500);
        if (cleanedCompleted.length > 0 || cleanedFailed.length > 0) {
          console.log(`[Queue Cleanup] Scheduling queue: removed ${cleanedCompleted.length} completed, ${cleanedFailed.length} failed jobs`);
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
  
  // Then run regular cleanup every 30 minutes
  setInterval(cleanup, CLEANUP_INTERVAL);
  
  console.log('✅ Queue cleanup scheduled (aggressive on startup, then every 30 minutes)');
}

/**
 * Periodic recovery of stuck emails in "sending" state
 * Runs every 10 minutes to find emails that have been stuck for too long
 */
function startStuckEmailRecovery(): void {
  const RECOVERY_INTERVAL = 10 * 60 * 1000; // 10 minutes
  
  // Run recovery immediately, then every 10 minutes
  recoverStuckEmails();
  setInterval(recoverStuckEmails, RECOVERY_INTERVAL);
  
  console.log('✅ Stuck email recovery scheduled (runs every 10 minutes)');
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

