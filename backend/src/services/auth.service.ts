import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { env } from '../config/env';
import { JwtPayload, RefreshTokenPayload, TokenPair, LoginResponse } from '../types/auth.types';
import { User, UserSafe } from '../types';
import { UnauthorizedError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { createAuditLog } from './auditLog.service';

const SALT_ROUNDS = 12;

function generateAccessToken(user: Pick<User, 'id' | 'email' | 'role_id'>): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    roleId: user.role_id,
  };
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, { expiresIn: env.JWT_EXPIRY } as jwt.SignOptions);
}

function generateRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = {
    userId,
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET as jwt.Secret, { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions);
}

export async function login(
  username: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResponse & { refreshToken: string }> {
  const result = await query(
    `SELECT u.*, r.name as role FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.email = $1 AND u.is_active = true`,
    [username]
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const user: User = result.rows[0];

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Update last_login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user.id);

  await createAuditLog({
    userId: user.id,
    action: 'LOGIN',
    entityType: 'user',
    entityId: user.id,
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  });

  logger.info(`User logged in: ${user.email}`);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;

    const result = await query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('User not found or inactive');
    }

    const user: User = result.rows[0];

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token has expired, please log in again');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    throw error;
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  const user: User = result.rows[0];

  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValidPassword) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
    newHash,
    userId,
  ]);

  await createAuditLog({
    userId,
    action: 'CHANGE_PASSWORD',
    entityType: 'user',
    entityId: userId,
  });

  logger.info(`Password changed for user: ${user.email}`);
}

export async function getProfile(userId: string): Promise<UserSafe> {
  const result = await query(
    `SELECT u.id, u.email, u.name, r.name as role, u.is_active, u.last_login_at, u.created_at, u.updated_at
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  return result.rows[0];
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}
