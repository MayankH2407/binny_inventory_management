import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as userService from '../services/user.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await userService.createUser(req.body, req.user!.userId);
    sendSuccess(res, user, 'User created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, role, search, is_active } = req.query as {
      page?: number; limit?: number; role?: string; search?: string; is_active?: boolean;
    };
    const result = await userService.getUsers(
      { role, search, is_active },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getUserById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await userService.getUserById(req.params.id);
    sendSuccess(res, user, 'User retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user!.userId);
    sendSuccess(res, user, 'User updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await userService.deleteUser(req.params.id, req.user!.userId);
    sendSuccess(res, null, 'User deactivated successfully');
  } catch (error) {
    next(error);
  }
}
