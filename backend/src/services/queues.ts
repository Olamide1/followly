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
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableOfflineQueue: true, // Queue commands while reconnecting
      // Connection optimization: Bull uses ioredis which supports connection pooling
      // maxRetriesPerRequest: null allows ioredis to manage retries more efficiently
      maxRetriesPerRequest: null, // Disable automatic retries (Bull handles retries)
    };
  }
  
  // For local development without TLS
  return redisUrl;
}

export async function initializeQueues(): Promise<void> {
  try {
    const redisConfig = getRedisConfig();

    // Create queues with optimized connection settings
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
    });

    // Add error handlers for better debugging
    emailQueue.on('error', (error) => {
      console.error('Email queue error:', error);
    });
    
    emailQueue.on('failed', (job, err) => {
      console.error(`Email job ${job?.id} failed:`, err?.message || err);
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

    // Note: Processors are NOT registered here to avoid duplicate registration
    // The worker dyno (workers/index.ts) is responsible for registering processors
    // This ensures jobs are only processed once, avoiding race conditions

    console.log('✅ Queues initialized');
  } catch (error) {
    console.error('Queue initialization error:', error);
    throw error;
  }
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

