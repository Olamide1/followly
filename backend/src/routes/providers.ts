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
      'SELECT id, provider, from_email, from_name, daily_limit, is_active, is_default, created_at FROM provider_configs WHERE user_id = $1',
      [req.userId]
    );

    // Don't send API keys
    const configs = result.rows.map((row: any) => ({
      ...row,
      api_key: undefined,
      api_secret: undefined,
    }));

    res.json({ configs });
  } catch (error: any) {
    next(error);
  }
});

// Create/update provider config
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { provider, api_key, api_secret, from_email, from_name, daily_limit, is_default } = req.body;

    if (!provider || !['brevo', 'mailjet', 'resend'].includes(provider)) {
      throw createError('Invalid provider', 400);
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

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(existing.rows[0].id);
        await pool.query(
          `UPDATE provider_configs SET ${updates.join(', ')} WHERE id = $${paramCount++}`,
          params
        );
      }

      const result = await pool.query(
        'SELECT * FROM provider_configs WHERE id = $1',
        [existing.rows[0].id]
      );
      config = result.rows[0];
    } else {
      // Create
      const result = await pool.query(
        `INSERT INTO provider_configs 
         (user_id, provider, api_key, api_secret, from_email, from_name, daily_limit, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.userId, provider, api_key, api_secret, from_email, from_name, daily_limit || 0, is_default || false]
      );
      config = result.rows[0];
    }

    // Don't send API keys
    delete config.api_key;
    delete config.api_secret;

    res.json({ config });
  } catch (error: any) {
    next(error);
  }
});

// Delete provider config
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await pool.query(
      'DELETE FROM provider_configs WHERE id = $1 AND user_id = $2',
      [parseInt(req.params.id), req.userId]
    );
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

export default router;

