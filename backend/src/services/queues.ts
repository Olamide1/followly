import Queue from 'bull';
import { processEmailQueue } from '../workers/emailWorker';
// import { processAutomationQueue } from '../workers/automationWorker'; // DISABLED: Temporarily commented out
import { processSchedulingQueue } from '../workers/schedulingWorker';

let emailQueue: Queue.Queue | null = null;
// let automationQueue: Queue.Queue | null = null; // DISABLED: Temporarily commented out
let schedulingQueue: Queue.Queue | null = null;

// Parse Redis URL and configure for Heroku TLS
function getRedisConfig() {
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
      // Note: Bull doesn't allow enableReadyCheck or maxRetriesPerRequest
      // These are handled internally by Bull
      retryStrategy: (times: number) => {
        // Exponential backoff with max delay
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableOfflineQueue: false, // Don't queue commands when offline
    };
  }
  
  // For local development without TLS
  return redisUrl;
}

export async function initializeQueues(): Promise<void> {
  try {
    const redisConfig = getRedisConfig();

    emailQueue = new Queue('email', { redis: redisConfig });
    // automationQueue = new Queue('automation', { redis: redisConfig }); // DISABLED: Temporarily commented out
    schedulingQueue = new Queue('scheduling', { redis: redisConfig });

    // Add error handlers for better debugging
    emailQueue.on('error', (error) => {
      console.error('Email queue error:', error);
    });
    
    schedulingQueue.on('error', (error) => {
      console.error('Scheduling queue error:', error);
    });

    // Process queues
    emailQueue.process(processEmailQueue);
    // automationQueue.process(processAutomationQueue); // DISABLED: Temporarily commented out
    schedulingQueue.process(processSchedulingQueue);

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

