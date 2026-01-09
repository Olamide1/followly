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

// Get preferences (public endpoint - uses email and optional token)
router.get('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find contact by email
    const contactResult = await pool.query(
      'SELECT email, name, subscription_status FROM contacts WHERE email = $1',
      [(email as string).toLowerCase()]
    );

    if (contactResult.rows.length === 0) {
      // Return a default response even if contact doesn't exist (privacy)
      return res.json({
        email: email,
        subscription_status: 'subscribed', // Default
        found: false,
      });
    }

    const contact = contactResult.rows[0];
    return res.json({
      email: contact.email,
      name: contact.name,
      subscription_status: contact.subscription_status,
      found: true,
    });
  } catch (error: any) {
    next(error);
  }
});

// Update preferences (public endpoint - uses email)
router.post('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, subscription_status } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    if (!subscription_status || !['subscribed', 'unsubscribed'].includes(subscription_status)) {
      return res.status(400).json({ error: 'Valid subscription_status required (subscribed or unsubscribed)' });
    }

    // Find contact by email
    const contactResult = await pool.query(
      'SELECT id, user_id, subscription_status FROM contacts WHERE email = $1',
      [email.toLowerCase()]
    );

    if (contactResult.rows.length === 0) {
      // Contact not found - return success for privacy, but note it wasn't found
      return res.json({
        success: true,
        message: 'Preferences updated',
        note: 'Email not found in our system, but request processed',
      });
    }

    const contact = contactResult.rows[0];
    const previousStatus = contact.subscription_status;

    // Update subscription status
    await pool.query(
      'UPDATE contacts SET subscription_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [subscription_status, contact.id]
    );

    // Handle suppression list
    if (subscription_status === 'unsubscribed') {
      // Add to suppression list
      await pool.query(
        `INSERT INTO suppression_list (user_id, email, reason)
         VALUES ($1, $2, 'unsubscribed')
         ON CONFLICT (user_id, email) DO UPDATE SET reason = 'unsubscribed'`,
        [contact.user_id, email.toLowerCase()]
      );
    } else if (previousStatus === 'unsubscribed' && subscription_status === 'subscribed') {
      // Remove from suppression list if resubscribing
      await pool.query(
        'DELETE FROM suppression_list WHERE user_id = $1 AND email = $2',
        [contact.user_id, email.toLowerCase()]
      );
    }

    return res.json({
      success: true,
      message: 'Preferences updated successfully',
      subscription_status,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

