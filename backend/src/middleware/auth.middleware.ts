import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest, JwtPayload } from '../types/auth.types';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

function extractToken(req: AuthenticatedRequest): string | null {
  // Check httpOnly cookie first
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  // Fall back to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('Authentication token is required');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      roleId: decoded.roleId,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token has expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
      return;
    }
    if (error instanceof UnauthorizedError) {
      next(error);
      return;
    }
    logger.error('Authentication error', error);
    next(new UnauthorizedError('Authentication failed'));
  }
}

export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const token = extractToken(req);

    if (token) {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        roleId: decoded.roleId,
      };
    }

    next();
  } catch {
    // Token is invalid/expired but this is optional auth, so proceed without user
    next();
  }
}
