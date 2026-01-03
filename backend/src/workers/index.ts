import Bull from 'bull';
import { processEmailQueue } from './emailWorker';
import { processAutomationQueue } from './automationWorker';
import { processSchedulingQueue } from './schedulingWorker';

// Parse Redis URL and configure for Heroku TLS
function getRedisConfig() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
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
      enableOfflineQueue: true, // Queue commands while reconnecting
    };
  }
  
  // For local development without TLS
  return redisUrl;
}

const redisConfig = getRedisConfig();

// Create queues
const emailQueue = new Bull('email', { redis: redisConfig });
const automationQueue = new Bull('automation', { redis: redisConfig });
const schedulingQueue = new Bull('scheduling', { redis: redisConfig });

// Error handling
emailQueue.on('error', (err) => {
  console.error('Email queue error:', err.message);
});

automationQueue.on('error', (err) => {
  console.error('Automation queue error:', err.message);
});

schedulingQueue.on('error', (err) => {
  console.error('Scheduling queue error:', err.message);
});

emailQueue.on('failed', (job, err) => {
  console.error(`Email job ${job.id} failed:`, err.message);
});

automationQueue.on('failed', (job, err) => {
  console.error(`Automation job ${job.id} failed:`, err.message);
});

schedulingQueue.on('failed', (job, err) => {
  console.error(`Scheduling job ${job.id} failed:`, err.message);
});

// Wait for Redis connection before starting processors
async function startWorkers() {
  try {
    await Promise.all([
      emailQueue.isReady(),
      automationQueue.isReady(),
      schedulingQueue.isReady(),
    ]);

    console.log('✅ Redis connection ready');

    // Register processors
    emailQueue.process(async (job) => {
      console.log(`Processing email job ${job.id}`);
      return processEmailQueue(job);
    });

    automationQueue.process(async (job) => {
      console.log(`Processing automation job ${job.id}`);
      return processAutomationQueue(job);
    });

    schedulingQueue.process(async (job) => {
      console.log(`Processing scheduling job ${job.id}`);
      return processSchedulingQueue(job);
    });

    console.log('🚀 Combined worker started - listening for email, automation, and scheduling jobs');
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }
}

startWorkers();

