import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

export default router;

