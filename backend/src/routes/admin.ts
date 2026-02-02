import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pauseEmailQueue, resumeEmailQueue, isEmailQueuePaused, getQueueJobCounts } from '../services/queues';
import { pool } from '../database/connection';

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
 * Get email queue status (Bull queues + database)
 * GET /api/admin/queue/status
 */
router.get('/queue/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const paused = await isEmailQueuePaused();
    const jobCounts = await getQueueJobCounts();
    
    // Also check database for pending/queued/sending emails
    const dbStatus = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE status IN ('pending', 'queued', 'sending')
       GROUP BY status`
    );
    
    const dbCounts: Record<string, number> = {};
    dbStatus.rows.forEach((row: any) => {
      dbCounts[row.status] = parseInt(row.count);
    });
    
    res.json({ 
      paused,
      message: paused ? 'Email queue is paused' : 'Email queue is active',
      queues: jobCounts,
      database: {
        pending: dbCounts.pending || 0,
        queued: dbCounts.queued || 0,
        sending: dbCounts.sending || 0,
        totalPending: (dbCounts.pending || 0) + (dbCounts.queued || 0) + (dbCounts.sending || 0),
      },
      summary: {
        totalWaiting: jobCounts.email.waiting + jobCounts.campaignSend.waiting + jobCounts.scheduling.waiting + jobCounts.contactImport.waiting,
        totalActive: jobCounts.email.active + jobCounts.campaignSend.active + jobCounts.scheduling.active + jobCounts.contactImport.active,
        totalFailed: jobCounts.email.failed + jobCounts.campaignSend.failed + jobCounts.scheduling.failed + jobCounts.contactImport.failed,
        totalDelayed: jobCounts.email.delayed + jobCounts.campaignSend.delayed + jobCounts.scheduling.delayed + jobCounts.contactImport.delayed,
      }
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Get pending emails from database (works without Bull queue access)
 * GET /api/admin/emails/pending
 */
router.get('/emails/pending', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    
    // Check for pending/queued/sending emails in database
    const result = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE user_id = $1 AND status IN ('pending', 'queued', 'sending')
       GROUP BY status`,
      [userId]
    );
    
    const counts: Record<string, number> = {};
    result.rows.forEach((row: any) => {
      counts[row.status] = parseInt(row.count);
    });
    
    const totalPending = (counts.pending || 0) + (counts.queued || 0) + (counts.sending || 0);
    
    res.json({
      pending: counts.pending || 0,
      queued: counts.queued || 0,
      sending: counts.sending || 0,
      totalPending,
      hasPendingEmails: totalPending > 0,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;
