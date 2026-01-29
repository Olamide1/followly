import dotenv from 'dotenv';
dotenv.config(); // Must be first, before any other imports that use env vars

import { processEmailQueue } from './emailWorker';
// import { processAutomationQueue } from './automationWorker'; // DISABLED: Temporarily commented out
import { processSchedulingQueue } from './schedulingWorker';
import { processCampaignSendQueue } from './campaignSendWorker';
import { initializeRedis } from '../services/redis';
import { initializeDatabase } from '../database/connection';
import { initializeQueues, getEmailQueue, getSchedulingQueue, getCampaignSendQueue } from '../services/queues';

// Wait for Redis connection before starting processors
async function startWorkers() {
  try {
    // Initialize database and Redis first (required by services)
    await initializeDatabase();
    await initializeRedis();
    
    // Initialize queues with shared Redis config (this reuses the same config as web dyno)
    // Note: initializeQueues() only creates queues, it does NOT register processors
    // Processors are registered below to ensure jobs are only processed once
    await initializeQueues();

    // Get queue instances (these use the shared Redis config)
    const emailQueue = getEmailQueue();
    const schedulingQueue = getSchedulingQueue();
    const campaignSendQueue = getCampaignSendQueue();

    // Register processors on the shared queue instances
    emailQueue.process(async (job) => {
      console.log(`Processing email job ${job.id}`);
      return processEmailQueue(job);
    });

    // Note: Automation queue is currently disabled
    // const automationQueue = getAutomationQueue();
    // automationQueue.process(async (job) => {
    //   console.log(`Processing automation job ${job.id}`);
    //   return processAutomationQueue(job);
    // });

    schedulingQueue.process(async (job) => {
      console.log(`Processing scheduling job ${job.id}`);
      return processSchedulingQueue(job);
    });

    campaignSendQueue.process(async (job) => {
      console.log(`Processing campaign send job ${job.id}`);
      return processCampaignSendQueue(job);
    });

    console.log('🚀 Combined worker started - listening for email, automation, scheduling, and campaign send jobs');
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }
}

startWorkers();

