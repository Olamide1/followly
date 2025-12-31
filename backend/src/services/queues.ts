import Queue from 'bull';
import { processEmailQueue } from '../workers/emailWorker';
import { processAutomationQueue } from '../workers/automationWorker';
import { processSchedulingQueue } from '../workers/schedulingWorker';

let emailQueue: Queue.Queue | null = null;
let automationQueue: Queue.Queue | null = null;
let schedulingQueue: Queue.Queue | null = null;

export async function initializeQueues(): Promise<void> {
  try {
    const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

    emailQueue = new Queue('email', redisUrl);
    automationQueue = new Queue('automation', redisUrl);
    schedulingQueue = new Queue('scheduling', redisUrl);

    // Process queues
    emailQueue.process(processEmailQueue);
    automationQueue.process(processAutomationQueue);
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

export function getAutomationQueue() {
  if (!automationQueue) {
    throw new Error('Automation queue not initialized');
  }
  return automationQueue;
}

export function getSchedulingQueue() {
  if (!schedulingQueue) {
    throw new Error('Scheduling queue not initialized');
  }
  return schedulingQueue;
}

