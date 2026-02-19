import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';
import { resolveTeamUserIds } from '../services/team';

export interface AuthRequest extends Request {
  userId?: number;
  teamUserIds?: number[];
  user?: {
    id: number;
    email: string;
    name?: string;
    teamId?: number;
    teamRole?: string;
  };
}

export async function authenticateToken(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw createError('Authentication token required', 401);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw createError('JWT secret not configured', 500);
  }

  try {
    const decoded = jwt.verify(token, secret) as { userId: number; email: string };
    req.userId = decoded.userId;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };

    // Resolve team user IDs
    try {
      const { pool } = await import('../database/connection');
      const userResult = await pool.query(
        'SELECT team_id, team_role FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length > 0 && userResult.rows[0].team_id) {
        req.user.teamId = userResult.rows[0].team_id;
        req.user.teamRole = userResult.rows[0].team_role;
      }

      req.teamUserIds = await resolveTeamUserIds(decoded.userId);
    } catch {
      // Fallback: if team resolution fails, use just the user's own ID
      req.teamUserIds = [decoded.userId];
    }

    next();
  } catch (error) {
    throw createError('Invalid or expired token', 401);
  }
}
