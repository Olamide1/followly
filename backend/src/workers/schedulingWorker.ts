import { Job } from 'bull';
import { pool } from '../database/connection';
import { getSchedulingQueue } from '../services/queues';

/**
 * Safely delay a scheduling job, handling "Missing lock" errors by re-adding to queue
 */
async function safelyDelaySchedulingJob(job: Job, targetTimestamp: number): Promise<void> {
  try {
    await job.moveToDelayed(targetTimestamp);
  } catch (error: any) {
    if (error.message?.includes('Missing lock') || error.message?.includes('delayed')) {
      console.warn(`[Scheduling Worker] Job ${job.id} lock expired, re-adding to queue with delay`);
      try {
        const schedulingQueue = getSchedulingQueue();
        const delayMs = Math.max(0, targetTimestamp - Date.now());
        await schedulingQueue.add(job.data, {
          delay: delayMs,
          jobId: `retry-${job.id}-${Date.now()}`,
          attempts: job.opts.attempts || 3,
          removeOnComplete: job.opts.removeOnComplete || true,
          removeOnFail: job.opts.removeOnFail || false,
        });
        try {
          await job.remove();
        } catch (removeError: any) {
          // Ignore errors removing the job
        }
      } catch (requeueError: any) {
        console.error(`[Scheduling Worker] Failed to re-add job ${job.id}:`, requeueError?.message);
        throw error;
      }
    } else {
      throw error;
    }
  }
}

export async function processSchedulingQueue(job: Job) {
  const { campaignId } = job.data;

  try {
    // Get scheduled campaign
    const result = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND status = $2',
      [campaignId, 'scheduled']
    );

    if (result.rows.length === 0) {
      return; // Campaign not found or already sent
    }

    const campaign = result.rows[0];

    // Validate scheduled_at exists and is valid
    if (!campaign.scheduled_at) {
      console.error(`Campaign ${campaignId} has null/undefined scheduled_at`);
      throw new Error(`Campaign ${campaignId} has no scheduled time`);
    }

    // Check if it's time to send
    const scheduledAt = new Date(campaign.scheduled_at);
    const scheduledTime = scheduledAt.getTime();
    
    // Validate: must be a valid date (not NaN) and not epoch (1970-01-01)
    // Epoch date (0) or invalid dates should be rejected
    if (isNaN(scheduledTime) || scheduledTime === 0) {
      console.error(`Invalid scheduled_at date for campaign ${campaignId}: ${campaign.scheduled_at}`);
      throw new Error(`Invalid scheduled_at date for campaign ${campaignId}`);
    }

    const now = new Date();
    const nowTime = now.getTime();

    // Validate: scheduled time must be in the future (reasonable check: at least 1 second in future)
    // This prevents processing campaigns with past dates or epoch dates
    if (scheduledTime <= nowTime) {
      // If scheduled time has passed, we should still send it (it's overdue)
      // But log a warning
      console.warn(`Campaign ${campaignId} scheduled time has passed (${scheduledAt.toISOString()}), sending now`);
    } else {
      // Not time yet, reschedule - use safe delay function
      const targetTimestamp = scheduledTime;
      await safelyDelaySchedulingJob(job, targetTimestamp);
      return;
    }

    // Trigger campaign send
    const campaignService = new (await import('../services/campaigns')).CampaignService(
      new (await import('../services/routing')).RoutingService(
        new (await import('../services/providers')).EmailProviderService()
      ),
      new (await import('../services/providers')).EmailProviderService(),
      new (await import('../services/warmup')).WarmupService()
    );

    await campaignService.sendCampaign(campaign.user_id, campaignId);

    return { success: true };
  } catch (error: any) {
    console.error('Scheduling error:', error);
    throw error;
  }
}

