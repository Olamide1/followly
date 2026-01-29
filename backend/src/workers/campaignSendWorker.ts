import { Job } from 'bull';
import { CampaignService } from '../services/campaigns';
import { RoutingService } from '../services/routing';
import { EmailProviderService } from '../services/providers';
import { WarmupService } from '../services/warmup';

/**
 * Process campaign send job
 * This worker processes campaign sends in batches to avoid timeouts
 * It handles the heavy lifting of queuing individual emails
 */
export async function processCampaignSendQueue(job: Job) {
  const { userId, campaignId } = job.data;

  if (!userId || !campaignId) {
    throw new Error('Missing required fields: userId and campaignId');
  }

  console.log(`[Campaign Send Worker] Processing campaign ${campaignId} for user ${userId}`);

  // Initialize services
  const routingService = new RoutingService(new EmailProviderService());
  const emailProviderService = new EmailProviderService();
  const warmupService = new WarmupService();
  const campaignService = new CampaignService(
    routingService,
    emailProviderService,
    warmupService
  );

  // Process the campaign send (this will queue individual emails)
  const result = await campaignService.sendCampaign(userId, campaignId);

  console.log(`[Campaign Send Worker] Campaign ${campaignId} processed: ${result.queued} emails queued`);

  return result;
}
