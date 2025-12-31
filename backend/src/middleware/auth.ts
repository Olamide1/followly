import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';

export interface AuthRequest extends Request {
  userId?: number;
  user?: {
    id: number;
    email: string;
    name?: string;
  };
}

export function authenticateToken(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
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
    next();
  } catch (error) {
    throw createError('Invalid or expired token', 401);
  }
}

