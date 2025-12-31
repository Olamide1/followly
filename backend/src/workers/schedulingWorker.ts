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

    // Check if it's time to send
    const scheduledAt = new Date(campaign.scheduled_at);
    const now = new Date();

    if (now < scheduledAt) {
      // Not time yet, reschedule
      const delay = scheduledAt.getTime() - now.getTime();
      await job.moveToDelayed(delay);
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

