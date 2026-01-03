import { Job } from 'bull';
import { pool } from '../database/connection';

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
      // Not time yet, reschedule - moveToDelayed expects a timestamp, not a delay
      const targetTimestamp = scheduledTime;
      await job.moveToDelayed(targetTimestamp);
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

