import dotenv from 'dotenv';
dotenv.config(); // Must be first, before any other imports that use env vars

import { processEmailQueue } from './emailWorker';
// import { processAutomationQueue } from './automationWorker'; // DISABLED: Temporarily commented out
import { processSchedulingQueue } from './schedulingWorker';
import { processCampaignSendQueue } from './campaignSendWorker';
import { processContactImportQueue } from './contactImportWorker';
import { initializeRedis } from '../services/redis';
import { initializeDatabase } from '../database/connection';
import { initializeQueues, getEmailQueue, getSchedulingQueue, getCampaignSendQueue, getContactImportQueue } from '../services/queues';

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
    const contactImportQueue = getContactImportQueue();

    // Verify queues are initialized
    if (!emailQueue || !schedulingQueue || !campaignSendQueue || !contactImportQueue) {
      throw new Error('One or more queues failed to initialize');
    }
    
    console.log('[Worker] ✅ All queues initialized successfully');

    // Register processors on the shared queue instances
    // Limit email processing to 1 concurrent job to reduce Redis connection usage
    emailQueue.process(1, async (job) => {
      console.log(`[Worker] Processing email job ${job.id}`);
      return processEmailQueue(job);
    });

    // Note: Automation queue is currently disabled
    // const automationQueue = getAutomationQueue();
    // automationQueue.process(async (job) => {
    //   console.log(`Processing automation job ${job.id}`);
    //   return processAutomationQueue(job);
    // });

    schedulingQueue.process(async (job) => {
      console.log(`[Worker] Processing scheduling job ${job.id}`);
      return processSchedulingQueue(job);
    });

    campaignSendQueue.process(async (job) => {
      console.log(`[Worker] 🔄 Processing campaign send job ${job.id} (campaign ${job.data.campaignId}, user ${job.data.userId})`);
      try {
        const result = await processCampaignSendQueue(job);
        console.log(`[Worker] ✅ Campaign send job ${job.id} completed successfully`);
        return result;
      } catch (error: any) {
        console.error(`[Worker] ❌ Campaign send job ${job.id} failed:`, {
          error: error?.message || error,
          stack: error?.stack,
          campaignId: job.data.campaignId,
          userId: job.data.userId,
        });
        throw error;
      }
    });

    contactImportQueue.process(async (job) => {
      console.log(`[Worker] Processing contact import job ${job.id}`);
      return processContactImportQueue(job);
    });

    // Log queue status to verify they're ready
    try {
      const emailCounts = await emailQueue.getJobCounts();
      const campaignCounts = await campaignSendQueue.getJobCounts();
      console.log('[Worker] 📊 Initial queue status:', {
        email: emailCounts,
        campaignSend: campaignCounts,
      });
    } catch (error: any) {
      console.warn('[Worker] Could not get initial queue counts:', error?.message || error);
    }

    console.log('🚀 Combined worker started - listening for email, automation, scheduling, campaign send, and contact import jobs');
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }
}

startWorkers();

