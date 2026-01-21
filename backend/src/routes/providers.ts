import { Router, Response, NextFunction } from 'express';
import { pool } from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticateToken);

// Get provider configs
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT id, provider, from_email, from_name, daily_limit, is_active, is_default, created_at, updated_at,
       smtp_host, smtp_port, smtp_secure, smtp_user, dkim_domain, dkim_selector
       FROM provider_configs WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.userId]
    );

    // Don't send API keys and sensitive SMTP fields
    const configs = result.rows.map((row: any) => ({
      ...row,
      api_key: undefined,
      api_secret: undefined,
      smtp_pass: undefined,
      dkim_private_key: undefined,
    }));

    res.json({ configs });
  } catch (error: any) {
    next(error);
  }
});

// Create/update provider config
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { 
      provider, 
      api_key, 
      api_secret, 
      from_email, 
      from_name, 
      daily_limit, 
      is_default,
      // Nodemailer/SMTP specific fields
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_pass,
      dkim_domain,
      dkim_selector,
      dkim_private_key,
    } = req.body;

    if (!provider || !['brevo', 'mailjet', 'resend', 'nodemailer'].includes(provider)) {
      throw createError('Invalid provider', 400);
    }

    // Validate nodemailer-specific required fields
    if (provider === 'nodemailer') {
      console.log('[Providers API] Received nodemailer config:', {
        smtp_host: smtp_host ? 'present' : 'missing',
        smtp_port: smtp_port,
        smtp_secure: smtp_secure,
        smtp_user: smtp_user ? 'present' : 'missing',
        smtp_pass: smtp_pass ? 'present' : 'missing',
        from_email,
        from_name,
      });
      
      if (!smtp_host || !smtp_port || !smtp_user || !smtp_pass) {
        console.error('[Providers API] Missing required SMTP fields:', {
          smtp_host: !smtp_host,
          smtp_port: !smtp_port,
          smtp_user: !smtp_user,
          smtp_pass: !smtp_pass,
        });
        throw createError('SMTP host, port, user, and password are required for nodemailer', 400);
      }
    }

    // Check if config exists
    const existing = await pool.query(
      'SELECT id FROM provider_configs WHERE user_id = $1 AND provider = $2',
      [req.userId, provider]
    );

    let config;
    if (existing.rows.length > 0) {
      // Update
      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (api_key !== undefined) {
        updates.push(`api_key = $${paramCount++}`);
        params.push(api_key);
      }
      if (api_secret !== undefined) {
        updates.push(`api_secret = $${paramCount++}`);
        params.push(api_secret);
      }
      if (from_email !== undefined) {
        updates.push(`from_email = $${paramCount++}`);
        params.push(from_email);
      }
      if (from_name !== undefined) {
        updates.push(`from_name = $${paramCount++}`);
        params.push(from_name);
      }
      if (daily_limit !== undefined) {
        updates.push(`daily_limit = $${paramCount++}`);
        params.push(daily_limit);
      }
      if (is_default !== undefined) {
        updates.push(`is_default = $${paramCount++}`);
        params.push(is_default);

        // If setting as default, unset others
        if (is_default) {
          await pool.query(
            'UPDATE provider_configs SET is_default = false WHERE user_id = $1 AND provider != $2',
            [req.userId, provider]
          );
        }
      }

      // Nodemailer/SMTP specific fields
      if (smtp_host !== undefined) {
        updates.push(`smtp_host = $${paramCount++}`);
        params.push(smtp_host);
      }
      if (smtp_port !== undefined) {
        updates.push(`smtp_port = $${paramCount++}`);
        params.push(smtp_port);
      }
      if (smtp_secure !== undefined) {
        updates.push(`smtp_secure = $${paramCount++}`);
        params.push(smtp_secure);
      }
      if (smtp_user !== undefined) {
        updates.push(`smtp_user = $${paramCount++}`);
        params.push(smtp_user);
      }
      if (smtp_pass !== undefined) {
        updates.push(`smtp_pass = $${paramCount++}`);
        params.push(smtp_pass);
      }
      if (dkim_domain !== undefined) {
        updates.push(`dkim_domain = $${paramCount++}`);
        params.push(dkim_domain);
      }
      if (dkim_selector !== undefined) {
        updates.push(`dkim_selector = $${paramCount++}`);
        params.push(dkim_selector);
      }
      if (dkim_private_key !== undefined) {
        updates.push(`dkim_private_key = $${paramCount++}`);
        params.push(dkim_private_key);
      }

      // Only set is_active to true if explicitly provided, otherwise keep current state
      // This allows updating credentials without reactivating
      if (req.body.is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        params.push(req.body.is_active);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(existing.rows[0].id);
        await pool.query(
          `UPDATE provider_configs SET ${updates.join(', ')} WHERE id = $${paramCount++}`,
          params
        );
      }

      const result = await pool.query(
        'SELECT * FROM provider_configs WHERE id = $1 AND user_id = $2',
        [existing.rows[0].id, req.userId]
      );
      config = result.rows[0];
      
      // Log saved config for nodemailer (without sensitive data)
      if (provider === 'nodemailer') {
        console.log('[Providers API] Updated nodemailer config saved:', {
          id: config.id,
          smtp_host: config.smtp_host ? 'present' : 'missing',
          smtp_port: config.smtp_port,
          smtp_secure: config.smtp_secure,
          smtp_user: config.smtp_user ? 'present' : 'missing',
          smtp_pass: config.smtp_pass ? 'present' : 'missing',
          from_email: config.from_email,
        });
      }
    } else {
      // Create
      const result = await pool.query(
        `INSERT INTO provider_configs 
         (user_id, provider, api_key, api_secret, from_email, from_name, daily_limit, is_default, is_active,
          smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, dkim_domain, dkim_selector, dkim_private_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          req.userId, 
          provider, 
          api_key, 
          api_secret, 
          from_email, 
          from_name, 
          daily_limit || 0, 
          is_default || false, 
          true,
          smtp_host || null,
          smtp_port || null,
          smtp_secure || false,
          smtp_user || null,
          smtp_pass || null,
          dkim_domain || null,
          dkim_selector || null,
          dkim_private_key || null,
        ]
      );
      config = result.rows[0];
      
      // Log saved config for nodemailer (without sensitive data)
      if (provider === 'nodemailer') {
        console.log('[Providers API] Created nodemailer config saved:', {
          id: config.id,
          smtp_host: config.smtp_host ? 'present' : 'missing',
          smtp_port: config.smtp_port,
          smtp_secure: config.smtp_secure,
          smtp_user: config.smtp_user ? 'present' : 'missing',
          smtp_pass: config.smtp_pass ? 'present' : 'missing',
          from_email: config.from_email,
        });
      }
    }

    // Don't send sensitive fields
    delete config.api_key;
    delete config.api_secret;
    delete config.smtp_pass;
    delete config.dkim_private_key;

    res.json({ config });
  } catch (error: any) {
    next(error);
  }
});

// Reactivate provider (set is_active to true) - must come before /:id route
router.post('/:id/reactivate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      'UPDATE provider_configs SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING id, provider, is_active',
      [parseInt(req.params.id), req.userId]
    );

    if (result.rows.length === 0) {
      throw createError('Provider not found', 404);
    }

    res.json({ success: true, config: result.rows[0] });
  } catch (error: any) {
    next(error);
  }
});

// Deactivate provider (soft delete - keeps info for reactivation)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const providerId = parseInt(req.params.id);
    
    // First, check if this is the default provider
    const checkDefault = await pool.query(
      'SELECT is_default FROM provider_configs WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    if (checkDefault.rows.length === 0) {
      throw createError('Provider not found', 404);
    }
    
    // If it's the default, we need to set another provider as default first
    if (checkDefault.rows[0].is_default) {
      // Find another active provider to set as default
      const otherProvider = await pool.query(
        'SELECT id FROM provider_configs WHERE user_id = $1 AND id != $2 AND is_active = true LIMIT 1',
        [req.userId, providerId]
      );
      
      if (otherProvider.rows.length > 0) {
        // Set another provider as default (include user_id for security)
        await pool.query(
          'UPDATE provider_configs SET is_default = true WHERE id = $1 AND user_id = $2',
          [otherProvider.rows[0].id, req.userId]
        );
      } else {
        // No other active providers, just unset default (include user_id for security)
        await pool.query(
          'UPDATE provider_configs SET is_default = false WHERE id = $1 AND user_id = $2',
          [providerId, req.userId]
        );
      }
    }
    
    // Deactivate (soft delete) - keeps all info for reactivation
    await pool.query(
      'UPDATE provider_configs SET is_active = false, is_default = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    res.json({ success: true, message: 'Provider deactivated. You can reactivate it later.' });
  } catch (error: any) {
    next(error);
  }
});

// Change default provider
router.post('/:id/set-default', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const providerId = parseInt(req.params.id);
    
    // Verify provider exists and belongs to user
    const checkProvider = await pool.query(
      'SELECT id, is_active FROM provider_configs WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    if (checkProvider.rows.length === 0) {
      throw createError('Provider not found', 404);
    }
    
    // Unset all other defaults
    await pool.query(
      'UPDATE provider_configs SET is_default = false WHERE user_id = $1 AND id != $2',
      [req.userId, providerId]
    );
    
    // Set this provider as default (and reactivate if it was inactive)
    // Include user_id check for security - prevents modifying other users' providers
    await pool.query(
      'UPDATE provider_configs SET is_default = true, is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    const result = await pool.query(
      'SELECT id, provider, is_default, is_active FROM provider_configs WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    res.json({ success: true, config: result.rows[0] });
  } catch (error: any) {
    next(error);
  }
});

// Hard delete provider (permanently remove - only for inactive providers)
router.delete('/:id/permanent', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const providerId = parseInt(req.params.id);
    
    // Verify provider exists, belongs to user, and is inactive
    const checkProvider = await pool.query(
      'SELECT id, is_active, is_default FROM provider_configs WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    if (checkProvider.rows.length === 0) {
      throw createError('Provider not found', 404);
    }
    
    if (checkProvider.rows[0].is_active) {
      throw createError('Cannot permanently delete an active provider. Deactivate it first.', 400);
    }
    
    // If it was the default (even though inactive), unset it (include user_id for security)
    if (checkProvider.rows[0].is_default) {
      await pool.query(
        'UPDATE provider_configs SET is_default = false WHERE id = $1 AND user_id = $2',
        [providerId, req.userId]
      );
    }
    
    // Permanently delete
    await pool.query(
      'DELETE FROM provider_configs WHERE id = $1 AND user_id = $2',
      [providerId, req.userId]
    );
    
    res.json({ success: true, message: 'Provider permanently deleted.' });
  } catch (error: any) {
    next(error);
  }
});

export default router;

