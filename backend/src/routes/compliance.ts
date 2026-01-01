import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Unsubscribe (public endpoint)
router.post('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required', success: false });
    }

    // Find contact by email
    const contactResult = await pool.query(
      'SELECT id, user_id, subscription_status FROM contacts WHERE email = $1',
      [email.toLowerCase()]
    );

    if (contactResult.rows.length > 0) {
      const contact = contactResult.rows[0];

      // Check if already unsubscribed
      if (contact.subscription_status === 'unsubscribed') {
        // Still add to suppression list to be safe
        await pool.query(
          `INSERT INTO suppression_list (user_id, email, reason)
           VALUES ($1, $2, 'unsubscribed')
           ON CONFLICT (user_id, email) DO UPDATE SET reason = 'unsubscribed'`,
          [contact.user_id, email.toLowerCase()]
        );
        return res.json({ 
          success: true, 
          message: 'Already unsubscribed',
          alreadyUnsubscribed: true 
        });
      }

      // Update subscription status
      await pool.query(
        'UPDATE contacts SET subscription_status = $1 WHERE id = $2',
        ['unsubscribed', contact.id]
      );

      // Add to suppression list
      await pool.query(
        `INSERT INTO suppression_list (user_id, email, reason)
         VALUES ($1, $2, 'unsubscribed')
         ON CONFLICT (user_id, email) DO UPDATE SET reason = 'unsubscribed'`,
        [contact.user_id, email.toLowerCase()]
      );

      return res.json({ success: true, message: 'Unsubscribed successfully' });
    } else {
      // Contact not found - still return success for privacy (don't reveal if email exists)
      // But we can't add to suppression list without user_id
      // For now, just return success
      return res.json({ 
        success: true, 
        message: 'Unsubscribed successfully',
        note: 'Email not found in our system, but request processed'
      });
    }
  } catch (error: any) {
    return next(error);
  }
});

// Get suppression list
router.get('/suppression', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT email, reason, created_at FROM suppression_list WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json({ suppressions: result.rows });
  } catch (error: any) {
    next(error);
  }
});

// Remove from suppression list
router.delete('/suppression/:email', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await pool.query(
      'DELETE FROM suppression_list WHERE user_id = $1 AND email = $2',
      [req.userId, req.params.email]
    );
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

export default router;

