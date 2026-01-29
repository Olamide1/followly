import { Router, Response, NextFunction } from 'express';
import { pool } from '../database/connection';
import { CampaignService } from '../services/campaigns';
import { RoutingService } from '../services/routing';
import { EmailProviderService } from '../services/providers';
import { WarmupService } from '../services/warmup';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getCampaignSendQueue } from '../services/queues';

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
      search: req.query.search as string,
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

// Send campaign (queues job for async processing to avoid H12 timeouts)
router.post('/:id/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const campaignId = parseInt(req.params.id);

    // Validate campaign exists and belongs to user before queuing
    const campaign = await campaignService.getCampaign(userId, campaignId);

    // Check if campaign is already sent or sending
    if (campaign.status === 'sending' || campaign.status === 'sent') {
      res.status(400).json({ error: 'Campaign already sent or sending' });
      return;
    }

    // Validate list_id
    if (!campaign.list_id) {
      res.status(400).json({ error: 'Campaign must have a list assigned' });
      return;
    }

    // Queue the campaign send job for async processing
    const campaignSendQueue = getCampaignSendQueue();
    const job = await campaignSendQueue.add({
      userId,
      campaignId,
    }, {
      jobId: `campaign-send-${campaignId}-${userId}`,
      attempts: 2,
    });

    // Return immediately - the worker will process the campaign send
    res.json({ 
      success: true,
      message: 'Campaign send queued successfully. Emails will be processed in the background.',
      jobId: job.id,
    });
  } catch (error: any) {
    return next(error);
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

// Recover campaign emails (re-queue failed or missing emails)
router.post('/:id/recover', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await campaignService.recoverCampaignEmails(req.userId!, parseInt(req.params.id));
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Send test email
router.post('/test-send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { to, subject, content, from_email, from_name } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, content' });
    }

    // Load user's providers
    const userProviders = await pool.query(
      'SELECT * FROM provider_configs WHERE user_id = $1 AND is_active = true ORDER BY is_default DESC LIMIT 1',
      [req.userId]
    );

    if (userProviders.rows.length === 0) {
      return res.status(400).json({ error: 'No email provider configured. Please add a provider in Settings.' });
    }

    const providerConfig = userProviders.rows[0];
    const providerService = new EmailProviderService();
    
    // Initialize provider
    const providerConfigObj: any = {
      provider: providerConfig.provider,
      isDefault: true,
    };

    switch (providerConfig.provider) {
      case 'brevo':
        providerConfigObj.brevo = {
          apiKey: providerConfig.api_key,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
        };
        break;
      case 'mailjet':
        providerConfigObj.mailjet = {
          apiKey: providerConfig.api_key,
          apiSecret: providerConfig.api_secret,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
        };
        break;
      case 'resend':
        providerConfigObj.resend = {
          apiKey: providerConfig.api_key,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
        };
        break;
      case 'nodemailer':
        // Validate required SMTP fields
        if (!providerConfig.smtp_host || !providerConfig.smtp_port || !providerConfig.smtp_user || !providerConfig.smtp_pass) {
          return res.status(400).json({ 
            error: 'Nodemailer provider is missing required SMTP configuration. Please update your provider settings.' 
          });
        }
        
        providerConfigObj.nodemailer = {
          host: providerConfig.smtp_host,
          port: typeof providerConfig.smtp_port === 'string' ? parseInt(providerConfig.smtp_port, 10) : providerConfig.smtp_port,
          secure: providerConfig.smtp_secure || false,
          user: providerConfig.smtp_user,
          pass: providerConfig.smtp_pass,
          fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
          // Enable connection pooling
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          // Add DKIM if configured
          ...(providerConfig.dkim_domain && providerConfig.dkim_private_key && {
            dkim: {
              domainName: providerConfig.dkim_domain,
              keySelector: providerConfig.dkim_selector || 'default',
              privateKey: providerConfig.dkim_private_key,
            },
          }),
        };
        break;
    }

    providerService.addProvider(providerConfigObj);
    const provider = providerService.getProvider(providerConfig.provider as 'brevo' | 'mailjet' | 'resend' | 'nodemailer');

    if (!provider) {
      return res.status(500).json({ error: 'Failed to initialize email provider' });
    }

    // Send test email
    await provider.sendEmail({
      to,
      subject,
      htmlContent: content,
      fromEmail: from_email || providerConfig.from_email || process.env.DEFAULT_FROM_EMAIL || '',
      fromName: from_name || providerConfig.from_name || process.env.DEFAULT_FROM_NAME,
    });

    return res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error: any) {
    return next(error);
  }
});

export default router;

