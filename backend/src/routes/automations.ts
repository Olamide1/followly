import { Router, Response, NextFunction } from 'express';
import { AutomationService } from '../services/automations';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

const automationService = new AutomationService();

// Create automation
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const automation = await automationService.createAutomation(req.userId!, req.body);
    res.status(201).json({ automation });
  } catch (error: any) {
    next(error);
  }
});

// Get automation
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const automation = await automationService.getAutomation(req.userId!, parseInt(req.params.id));
    res.json({ automation });
  } catch (error: any) {
    next(error);
  }
});

// List automations
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const automations = await automationService.listAutomations(req.userId!, {
      status: req.query.status as string,
    });
    res.json({ automations });
  } catch (error: any) {
    next(error);
  }
});

// Update automation
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const automation = await automationService.updateAutomation(
      req.userId!,
      parseInt(req.params.id),
      req.body
    );
    res.json({ automation });
  } catch (error: any) {
    next(error);
  }
});

// Delete automation
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await automationService.deleteAutomation(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Pause automation
router.post('/:id/pause', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await automationService.pauseAutomation(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Activate automation
router.post('/:id/activate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await automationService.activateAutomation(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

export default router;

