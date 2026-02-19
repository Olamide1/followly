import { Router, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { TeamService } from '../services/team';
import { createError } from '../middleware/errorHandler';
import { pool } from '../database/connection';

const router = Router();
router.use(authenticateToken);

const teamService = new TeamService();

// Create team
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      throw createError('Team name is required', 400);
    }
    const team = await teamService.createTeam(req.userId!, name.trim());
    res.status(201).json({ team });
  } catch (error: any) {
    next(error);
  }
});

// Get team info
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await teamService.getTeam(req.userId!);
    res.json({ team });
  } catch (error: any) {
    next(error);
  }
});

// Invite member
router.post('/invite', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      throw createError('Email is required', 400);
    }

    const result = await teamService.inviteMember(req.userId!, email.trim().toLowerCase());

    // Send invitation email
    try {
      const frontendUrl = process.env.FRONTEND_URL ||
        (process.env.NODE_ENV === 'production'
          ? process.env.APP_URL || 'https://followly-1a83c23a0be1.herokuapp.com'
          : process.env.APP_URL || 'http://localhost:5174');

      const inviteUrl = `${frontendUrl}/accept-invite?token=${result.token}`;

      // Load a provider to send the email
      const providerConfigs = await pool.query(
        'SELECT * FROM provider_configs WHERE user_id = ANY($1::int[]) AND is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1',
        [req.teamUserIds!]
      );

      if (providerConfigs.rows.length > 0) {
        const config = providerConfigs.rows[0];
        const { EmailProviderService } = await import('../services/providers');
        const providerService = new EmailProviderService();

        const providerConfig: any = {
          provider: config.provider,
          isDefault: true,
        };

        switch (config.provider) {
          case 'brevo':
            providerConfig.brevo = {
              apiKey: config.api_key,
              fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
              fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
            };
            break;
          case 'mailjet':
            providerConfig.mailjet = {
              apiKey: config.api_key,
              apiSecret: config.api_secret,
              fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
              fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
            };
            break;
          case 'resend':
            providerConfig.resend = {
              apiKey: config.api_key,
              fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
              fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
            };
            break;
          case 'nodemailer':
            if (config.smtp_host && config.smtp_port && config.smtp_user && config.smtp_pass) {
              providerConfig.nodemailer = {
                host: config.smtp_host,
                port: typeof config.smtp_port === 'string' ? parseInt(config.smtp_port, 10) : config.smtp_port,
                secure: config.smtp_secure || false,
                user: config.smtp_user,
                pass: config.smtp_pass,
                fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
                fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
                pool: true,
                maxConnections: 5,
                maxMessages: 100,
                ...(config.dkim_domain && config.dkim_private_key && {
                  dkim: {
                    domainName: config.dkim_domain,
                    keySelector: config.dkim_selector || 'default',
                    privateKey: config.dkim_private_key,
                  },
                }),
              };
            }
            break;
        }

        providerService.addProvider(providerConfig);

        const emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #fff; border: 1px solid #e5e5e5; padding: 40px; border-radius: 4px;">
              <h1 style="color: #000; font-size: 24px; font-weight: 300; margin-bottom: 20px;">You're Invited to Join a Team</h1>

              <p style="color: #666; margin-bottom: 20px;">
                ${result.inviterName} has invited you to join <strong>${result.teamName}</strong> on Followly.
              </p>

              <p style="color: #666; margin-bottom: 20px;">
                As a team member, you'll have access to shared contacts, lists, and campaigns.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 4px; font-weight: 500;">
                  Accept Invitation
                </a>
              </div>

              <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="color: #666; font-size: 12px; word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">
                ${inviteUrl}
              </p>

              <p style="color: #999; font-size: 12px; margin-top: 30px;">
                This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </div>
          </body>
          </html>
        `;

        await providerService.sendEmail('auto', {
          to: email.trim().toLowerCase(),
          subject: `You're invited to join ${result.teamName} on Followly`,
          htmlContent: emailContent,
          fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: config.from_name || process.env.DEFAULT_FROM_NAME || 'Followly',
        });
      }
    } catch (emailError: any) {
      console.error('Failed to send invitation email:', emailError.message);
      // Don't fail the request - invitation was created, email just didn't send
    }

    res.json({
      success: true,
      invitation: result.invitation,
    });
  } catch (error: any) {
    next(error);
  }
});

// Cancel invitation
router.post('/invite/:id/cancel', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const invitation = await teamService.cancelInvitation(req.userId!, parseInt(req.params.id));
    res.json({ success: true, invitation });
  } catch (error: any) {
    next(error);
  }
});

// Remove member
router.delete('/members/:userId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.removeMember(req.userId!, parseInt(req.params.userId));
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Leave team
router.post('/leave', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await teamService.leaveTeam(req.userId!);
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

export default router;
