import { Response, NextFunction } from 'express';
import { UserRole } from '../config/constants';
import { AuthenticatedRequest } from '../types/auth.types';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { query } from '../config/database';

export function authorize(...allowedRoles: UserRole[]) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }

      if (allowedRoles.length === 0) {
        next();
        return;
      }

      const result = await query('SELECT name FROM roles WHERE id = $1', [req.user.roleId]);

      if (result.rows.length === 0) {
        next(new ForbiddenError('User role not found'));
        return;
      }

      const userRole = result.rows[0].name as UserRole;

      if (!allowedRoles.includes(userRole)) {
        next(
          new ForbiddenError(
            `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${userRole}`
          )
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
