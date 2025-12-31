import { Router, Response, NextFunction } from 'express';
import { CampaignService } from '../services/campaigns';
import { RoutingService } from '../services/routing';
import { EmailProviderService } from '../services/providers';
import { WarmupService } from '../services/warmup';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// Initialize services
const providerService = new EmailProviderService();
const warmupService = new WarmupService();
const routingService = new RoutingService(providerService);
const campaignService = new CampaignService(routingService, providerService, warmupService);

// Create campaign
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await campaignService.createCampaign(req.userId!, req.body);
    res.status(201).json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

// Get campaign
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await campaignService.getCampaign(req.userId!, parseInt(req.params.id));
    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

// List campaigns
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await campaignService.listCampaigns(req.userId!, {
      type: req.query.type as 'broadcast' | 'lifecycle',
      status: req.query.status as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Update campaign
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await campaignService.updateCampaign(req.userId!, parseInt(req.params.id), req.body);
    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

// Delete campaign
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await campaignService.deleteCampaign(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Send campaign
router.post('/:id/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await campaignService.sendCampaign(req.userId!, parseInt(req.params.id));
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Get campaign stats
router.get('/:id/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await campaignService.getCampaignStats(req.userId!, parseInt(req.params.id));
    res.json({ stats });
  } catch (error: any) {
    next(error);
  }
});

export default router;

