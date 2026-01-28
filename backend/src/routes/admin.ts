import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { pauseEmailQueue, resumeEmailQueue, isEmailQueuePaused } from '../services/queues';

const router = Router();
router.use(authenticateToken);

/**
 * Pause email queue - stops processing new emails immediately
 * POST /api/admin/queue/pause
 */
router.post('/queue/pause', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await pauseEmailQueue();
    const paused = await isEmailQueuePaused();
    res.json({ 
      success: true, 
      paused,
      message: 'Email queue paused. No new emails will be processed.' 
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Resume email queue - resumes processing emails
 * POST /api/admin/queue/resume
 */
router.post('/queue/resume', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await resumeEmailQueue();
    const paused = await isEmailQueuePaused();
    res.json({ 
      success: true, 
      paused,
      message: 'Email queue resumed. Emails will be processed.' 
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Get email queue status
 * GET /api/admin/queue/status
 */
router.get('/queue/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const paused = await isEmailQueuePaused();
    res.json({ 
      paused,
      message: paused ? 'Email queue is paused' : 'Email queue is active' 
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;
