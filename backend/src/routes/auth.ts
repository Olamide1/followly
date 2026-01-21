import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../database/connection';
import { createError } from '../middleware/errorHandler';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, name, company } = req.body;

    if (!email || !password) {
      throw createError('Email and password required', 400);
    }

    // Check if user exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      throw createError('User already exists', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, company)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, company, created_at`,
      [email.toLowerCase(), passwordHash, name, company]
    );

    const user = result.rows[0];

    // Generate token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw createError('JWT secret not configured', 500);
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    // @ts-ignore - jwt.sign types are incorrect for expiresIn
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      secret,
      { expiresIn }
    ) as string;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
      },
      token,
    });
  } catch (error: any) {
    next(error);
  }
});

// Login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createError('Email and password required', 400);
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, name, company FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw createError('Invalid credentials', 401);
    }

    const user = result.rows[0];

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw createError('Invalid credentials', 401);
    }

    // Generate token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw createError('JWT secret not configured', 500);
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    // @ts-ignore - jwt.sign types are incorrect for expiresIn
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      secret,
      { expiresIn }
    ) as string;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
      },
      token,
    });
  } catch (error: any) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, company, role, company_address, custom_footer_text, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      throw createError('User not found', 404);
    }

    res.json({ user: result.rows[0] });
  } catch (error: any) {
    next(error);
  }
});

// Update user footer settings
router.put('/footer-settings', authenticateToken, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { company_address, custom_footer_text } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (company_address !== undefined) {
      updates.push(`company_address = $${paramCount++}`);
      params.push(company_address || null);
    }
    if (custom_footer_text !== undefined) {
      updates.push(`custom_footer_text = $${paramCount++}`);
      params.push(custom_footer_text || null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(req.userId);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount++}`,
      params
    );

    // Return updated user
    const result = await pool.query(
      'SELECT id, email, name, company, role, company_address, custom_footer_text, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    res.json({ user: result.rows[0] });
  } catch (error: any) {
    next(error);
  }
});

// Request password reset
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw createError('Email is required', 400);
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success (don't reveal if email exists)
    if (result.rows.length === 0) {
      res.json({ success: true, message: 'If the email exists, a password reset link has been sent.' });
      return;
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Store token in database
    await pool.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    // Get frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 
      (process.env.NODE_ENV === 'production' 
        ? process.env.APP_URL || 'https://followly-1a83c23a0be1.herokuapp.com'
        : process.env.APP_URL || 'http://localhost:5173');

    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Send password reset email
    const providersModule = await import('../services/providers');
    const { EmailProviderService } = providersModule;
    const providerService = new EmailProviderService();
    
    // Load user's provider configs (use default/active provider for system emails)
    const providerConfigs = await pool.query(
      'SELECT * FROM provider_configs WHERE user_id = $1 AND is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1',
      [user.id]
    );
    
    if (providerConfigs.rows.length === 0) {
      // User has no configured email provider - cannot send reset email
      // Clear the token we just set since we can't send the email
      await pool.query(
        'UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = $1',
        [user.id]
      );
      throw createError('No email provider configured. Please contact support for password reset.', 500);
    }
    
    const config = providerConfigs.rows[0];
    const providerConfig: any = {
      provider: config.provider as 'brevo' | 'mailjet' | 'resend' | 'nodemailer',
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
        providerConfig.nodemailer = {
          host: config.smtp_host,
          port: config.smtp_port,
          secure: config.smtp_secure || false,
          user: config.smtp_user,
          pass: config.smtp_pass,
          fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
          fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
          ...(config.dkim_domain && config.dkim_private_key && {
            dkim: {
              domainName: config.dkim_domain,
              keySelector: config.dkim_selector || 'default',
              privateKey: config.dkim_private_key,
            },
          }),
        };
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
          <h1 style="color: #000; font-size: 24px; font-weight: 300; margin-bottom: 20px;">Password Reset Request</h1>
          
          <p style="color: #666; margin-bottom: 20px;">
            Hello${user.name ? ` ${user.name}` : ''},
          </p>
          
          <p style="color: #666; margin-bottom: 20px;">
            You requested to reset your password. Click the button below to reset it:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 4px; font-weight: 500;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 10px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #666; font-size: 12px; word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">
            ${resetUrl}
          </p>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      </body>
      </html>
    `;

    try {
      await providerService.sendEmail('auto', {
        to: user.email,
        subject: 'Reset Your Password - Followly',
        htmlContent: emailContent,
        fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL || '',
        fromName: config.from_name || process.env.DEFAULT_FROM_NAME || 'Followly',
      });
    } catch (emailError: any) {
      // If email sending fails, clear the token and return error
      await pool.query(
        'UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = $1',
        [user.id]
      );
      console.error('Failed to send password reset email:', emailError);
      throw createError('Failed to send password reset email. Please try again later or contact support.', 500);
    }

    res.json({ success: true, message: 'If the email exists, a password reset link has been sent.' });
  } catch (error: any) {
    next(error);
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      throw createError('Token, email, and password are required', 400);
    }

    if (password.length < 8) {
      throw createError('Password must be at least 8 characters long', 400);
    }

    // Find user with valid token
    const result = await pool.query(
      `SELECT id FROM users 
       WHERE email = $1 
       AND password_reset_token = $2 
       AND password_reset_expires > CURRENT_TIMESTAMP`,
      [email.toLowerCase(), token]
    );

    if (result.rows.length === 0) {
      throw createError('Invalid or expired reset token', 400);
    }

    const userId = result.rows[0].id;

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and clear reset token
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           password_reset_token = NULL, 
           password_reset_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, userId]
    );

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error: any) {
    next(error);
  }
});

export default router;

