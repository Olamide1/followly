import { Router, Request, Response } from 'express';
import { pool } from '../database/connection';
import { recordOpenEvent, recordClickEvent } from '../services/tracking';

const router = Router();

// Middleware to verify webhook signatures (optional but recommended)
// For now, we'll accept all webhooks - you can add signature verification later

/**
 * Resend webhook handler
 * Resend sends webhook events for: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
 */
router.post('/resend', async (req: Request, res: Response) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    
    for (const event of events) {
      const { type, data } = event;
      
      // Resend sends email_id in data.email_id or data.id
      const resendEmailId = data?.email_id || data?.id;
      
      if (!resendEmailId) {
        console.warn(`Resend webhook: No email_id in event data for type ${type}`);
        continue;
      }

      // Find email_queue record by looking up in email_events first (where provider_event_id is stored)
      // We store the Resend email_id as provider_event_id when the email is sent
      const eventResult = await pool.query(
        `SELECT DISTINCT e.email_queue_id, e.contact_id, e.campaign_id 
         FROM email_events e
         WHERE e.provider_event_id = $1
         LIMIT 1`,
        [resendEmailId]
      );

      if (eventResult.rows.length === 0) {
        // Fallback: Try to find by email address and recent sent time
        // This handles cases where the initial 'sent' event hasn't been recorded yet
        const recipientEmail = data?.to || data?.recipient;
        if (!recipientEmail) {
          console.warn(`Resend webhook: No email found for event ${type} with ID ${resendEmailId} and no recipient email`);
          continue;
        }
        
        const emailQueueResult = await pool.query(
          `SELECT eq.id, eq.contact_id, eq.campaign_id 
           FROM email_queue eq
           JOIN contacts c ON c.id = eq.contact_id
           WHERE eq.provider = $1 AND c.email = $2 AND eq.status = 'sent'
           ORDER BY eq.sent_at DESC LIMIT 1`,
          ['resend', recipientEmail]
        );
        
        if (emailQueueResult.rows.length === 0) {
          console.warn(`Resend webhook: No email found for event ${type} with ID ${resendEmailId} and recipient ${recipientEmail}`);
          continue;
        }
        
        const { id: email_queue_id, contact_id, campaign_id } = emailQueueResult.rows[0];
        
        // Store the provider_event_id for future lookups
        await pool.query(
          `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
           VALUES ($1, $2, $3, 'sent', $4)
           ON CONFLICT DO NOTHING`,
          [email_queue_id, contact_id, campaign_id, resendEmailId]
        );
        
        // Handle different event types
        switch (type) {
          case 'email.opened':
            await recordOpenEvent(email_queue_id, contact_id, campaign_id, 'webhook');
            break;
          case 'email.clicked':
            await recordClickEvent(email_queue_id, contact_id, campaign_id, data?.link || null, 'webhook');
            break;
          case 'email.delivered':
            await pool.query(
              `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
               VALUES ($1, $2, $3, 'delivered', $4)
               ON CONFLICT DO NOTHING`,
              [email_queue_id, contact_id, campaign_id, data?.email_id || data?.id]
            );
            break;
          case 'email.bounced':
            await pool.query(
              `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
               VALUES ($1, $2, $3, 'bounced', $4)
               ON CONFLICT DO NOTHING`,
              [email_queue_id, contact_id, campaign_id, data?.email_id || data?.id]
            );
            break;
          case 'email.complained':
            await pool.query(
              `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
               VALUES ($1, $2, $3, 'complained', $4)
               ON CONFLICT DO NOTHING`,
              [email_queue_id, contact_id, campaign_id, data?.email_id || data?.id]
            );
            break;
        }
        continue;
      }

      const { email_queue_id: emailQueueId, contact_id, campaign_id } = eventResult.rows[0];

      // Handle different event types
      switch (type) {
        case 'email.opened':
          await recordOpenEvent(emailQueueId, contact_id, campaign_id, 'webhook');
          break;
        case 'email.clicked':
          await recordClickEvent(emailQueueId, contact_id, campaign_id, data?.link || null, 'webhook');
          break;
        case 'email.delivered':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'delivered', $4)
             ON CONFLICT DO NOTHING`,
            [emailQueueId, contact_id, campaign_id, data?.email_id || data?.id]
          );
          break;
        case 'email.bounced':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'bounced', $4)
             ON CONFLICT DO NOTHING`,
            [emailQueueId, contact_id, campaign_id, data?.email_id || data?.id]
          );
          break;
        case 'email.complained':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'complained', $4)
             ON CONFLICT DO NOTHING`,
            [emailQueueId, contact_id, campaign_id, data?.email_id || data?.id]
          );
          break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Resend webhook error:', error);
    // Still return 200 to prevent webhook retries
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Brevo (Sendinblue) webhook handler
 * Brevo sends webhook events with different structure
 */
router.post('/brevo', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const { event: eventType, messageId, email, link } = event;

    // Find email_queue record by looking up in email_events first
    const eventResult = await pool.query(
      'SELECT email_queue_id, contact_id, campaign_id FROM email_events WHERE provider_event_id = $1 LIMIT 1',
      [messageId]
    );
    
    if (eventResult.rows.length === 0) {
      // Try to find by email address and recent sent time (fallback)
      const emailQueueResult = await pool.query(
        `SELECT eq.id, eq.contact_id, eq.campaign_id 
         FROM email_queue eq
         JOIN contacts c ON c.id = eq.contact_id
         WHERE eq.provider = $1 AND c.email = $2 AND eq.status = 'sent'
         ORDER BY eq.sent_at DESC LIMIT 1`,
        ['brevo', email]
      );
      
      if (emailQueueResult.rows.length === 0) {
        console.warn(`Brevo webhook: No email found for event ${eventType} with message ID ${messageId}`);
        res.status(200).json({ received: true });
        return;
      }
      
      const { id: email_queue_id, contact_id, campaign_id } = emailQueueResult.rows[0];
      
      switch (eventType) {
        case 'opened':
          await recordOpenEvent(email_queue_id, contact_id, campaign_id, 'webhook');
          break;
        case 'click':
          await recordClickEvent(email_queue_id, contact_id, campaign_id, link || null, 'webhook');
          break;
        case 'delivered':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'delivered', $4)
             ON CONFLICT DO NOTHING`,
            [email_queue_id, contact_id, campaign_id, messageId]
          );
          break;
        case 'bounce':
        case 'hard_bounce':
        case 'soft_bounce':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'bounced', $4)
             ON CONFLICT DO NOTHING`,
            [email_queue_id, contact_id, campaign_id, messageId]
          );
          break;
        case 'spam':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'complained', $4)
             ON CONFLICT DO NOTHING`,
            [email_queue_id, contact_id, campaign_id, messageId]
          );
          break;
      }
      
      res.status(200).json({ received: true });
      return;
    }

    const { email_queue_id: emailQueueId, contact_id, campaign_id } = eventResult.rows[0];

    switch (eventType) {
      case 'opened':
        await recordOpenEvent(emailQueueId, contact_id, campaign_id, 'webhook');
        break;
      case 'click':
        await recordClickEvent(emailQueueId, contact_id, campaign_id, link || null, 'webhook');
        break;
      case 'delivered':
        await pool.query(
          `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
           VALUES ($1, $2, $3, 'delivered', $4)
           ON CONFLICT DO NOTHING`,
          [emailQueueId, contact_id, campaign_id, messageId]
        );
        break;
      case 'bounce':
      case 'hard_bounce':
      case 'soft_bounce':
        await pool.query(
          `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
           VALUES ($1, $2, $3, 'bounced', $4)
           ON CONFLICT DO NOTHING`,
          [emailQueueId, contact_id, campaign_id, messageId]
        );
        break;
      case 'spam':
        await pool.query(
          `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
           VALUES ($1, $2, $3, 'complained', $4)
           ON CONFLICT DO NOTHING`,
          [emailQueueId, contact_id, campaign_id, messageId]
        );
        break;
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Brevo webhook error:', error);
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Mailjet webhook handler
 * Mailjet sends webhook events with different structure
 */
router.post('/mailjet', async (req: Request, res: Response) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    
    for (const event of events) {
      const { event: eventType, MessageID, email, url } = event;

      // Find email_queue record by looking up in email_events first
      const eventResult = await pool.query(
        'SELECT email_queue_id, contact_id, campaign_id FROM email_events WHERE provider_event_id = $1 LIMIT 1',
        [MessageID]
      );
      
      if (eventResult.rows.length === 0) {
        // Try to find by email address and recent sent time (fallback)
        const emailQueueResult = await pool.query(
          `SELECT eq.id, eq.contact_id, eq.campaign_id 
           FROM email_queue eq
           JOIN contacts c ON c.id = eq.contact_id
           WHERE eq.provider = $1 AND c.email = $2 AND eq.status = 'sent'
           ORDER BY eq.sent_at DESC LIMIT 1`,
          ['mailjet', email]
        );
        
        if (emailQueueResult.rows.length === 0) {
          console.warn(`Mailjet webhook: No email found for event ${eventType} with message ID ${MessageID}`);
          continue;
        }
        
        const { id: email_queue_id, contact_id, campaign_id } = emailQueueResult.rows[0];
        
        switch (eventType) {
          case 'open':
            await recordOpenEvent(email_queue_id, contact_id, campaign_id, 'webhook');
            break;
          case 'click':
            await recordClickEvent(email_queue_id, contact_id, campaign_id, url || null, 'webhook');
            break;
          case 'sent':
            // Mailjet 'sent' is equivalent to 'delivered'
            await pool.query(
              `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
               VALUES ($1, $2, $3, 'delivered', $4)
               ON CONFLICT DO NOTHING`,
              [email_queue_id, contact_id, campaign_id, MessageID]
            );
            break;
          case 'bounce':
          case 'blocked':
            await pool.query(
              `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
               VALUES ($1, $2, $3, 'bounced', $4)
               ON CONFLICT DO NOTHING`,
              [email_queue_id, contact_id, campaign_id, MessageID]
            );
            break;
          case 'spam':
            await pool.query(
              `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
               VALUES ($1, $2, $3, 'complained', $4)
               ON CONFLICT DO NOTHING`,
              [email_queue_id, contact_id, campaign_id, MessageID]
            );
            break;
        }
        continue;
      }

      const { email_queue_id: emailQueueId, contact_id, campaign_id } = eventResult.rows[0];

      switch (eventType) {
        case 'open':
          await recordOpenEvent(emailQueueId, contact_id, campaign_id, 'webhook');
          break;
        case 'click':
          await recordClickEvent(emailQueueId, contact_id, campaign_id, url || null, 'webhook');
          break;
        case 'sent':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'delivered', $4)
             ON CONFLICT DO NOTHING`,
            [emailQueueId, contact_id, campaign_id, MessageID]
          );
          break;
        case 'bounce':
        case 'blocked':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'bounced', $4)
             ON CONFLICT DO NOTHING`,
            [emailQueueId, contact_id, campaign_id, MessageID]
          );
          break;
        case 'spam':
          await pool.query(
            `INSERT INTO email_events (email_queue_id, contact_id, campaign_id, event_type, provider_event_id)
             VALUES ($1, $2, $3, 'complained', $4)
             ON CONFLICT DO NOTHING`,
            [emailQueueId, contact_id, campaign_id, MessageID]
          );
          break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Mailjet webhook error:', error);
    res.status(200).json({ received: true, error: error.message });
  }
});

export default router;

