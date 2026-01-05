import { Router, Response, NextFunction } from 'express';
import { pool } from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// Get dashboard stats
router.get('/dashboard', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    // Total contacts
    const contactsResult = await pool.query(
      'SELECT COUNT(*) FROM contacts WHERE user_id = $1',
      [userId]
    );
    const totalContacts = parseInt(contactsResult.rows[0].count);

    // Total campaigns
    const campaignsResult = await pool.query(
      'SELECT COUNT(*) FROM campaigns WHERE user_id = $1',
      [userId]
    );
    const totalCampaigns = parseInt(campaignsResult.rows[0].count);

    // Total automations - DISABLED: Temporarily commented out
    // const automationsResult = await pool.query(
    //   'SELECT COUNT(*) FROM automations WHERE user_id = $1',
    //   [userId]
    // );
    // const totalAutomations = parseInt(automationsResult.rows[0].count);
    const totalAutomations = 0; // DISABLED: Set to 0 while automations are disabled

    // Email stats (last 30 days) - using email_queue for sent count, email_events for engagement
    const emailQueueResult = await pool.query(
      `SELECT COUNT(*) as sent
       FROM email_queue
       WHERE user_id = $1
       AND status = 'sent'
       AND sent_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );
    const sent = parseInt(emailQueueResult.rows[0]?.sent || '0');

    // Improved query: join with email_queue to ensure we only count events for this user's emails
    // Count distinct email_queue_ids to get unique opens/clicks per email (not per event)
    const emailStatsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT CASE WHEN e.event_type = 'delivered' THEN e.email_queue_id END) as delivered,
        COUNT(DISTINCT CASE WHEN e.event_type = 'opened' THEN e.email_queue_id END) as opened,
        COUNT(DISTINCT CASE WHEN e.event_type = 'clicked' THEN e.email_queue_id END) as clicked
       FROM email_events e
       INNER JOIN email_queue eq ON e.email_queue_id = eq.id
       WHERE eq.user_id = $1
       AND e.occurred_at >= NOW() - INTERVAL '30 days'`,
      [userId]
    );

    const emailStats = emailStatsResult.rows[0] || {};
    const delivered = parseInt(emailStats.delivered || '0');
    const opened = parseInt(emailStats.opened || '0');
    const clicked = parseInt(emailStats.clicked || '0');

    res.json({
      contacts: {
        total: totalContacts,
      },
      campaigns: {
        total: totalCampaigns,
      },
      automations: {
        total: totalAutomations,
      },
      emails: {
        sent,
        delivered,
        opened,
        clicked,
        openRate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : '0.00',
        clickRate: sent > 0 ? ((clicked / sent) * 100).toFixed(2) : '0.00',
        deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(2) : '0.00',
      },
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

