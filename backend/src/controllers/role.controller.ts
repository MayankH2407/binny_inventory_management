import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as roleService from '../services/role.service';
import { PERMISSION_CATALOG } from '../config/permissions';
import { sendSuccess } from '../utils/response';

export async function listRoles(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const roles = await roleService.listRoles();
    sendSuccess(res, { roles }, 'Roles retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getRoleById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = await roleService.getRoleById(req.params.id);
    sendSuccess(res, role, 'Role retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function createRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = await roleService.createRole(req.body);
    sendSuccess(res, role, 'Role created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = await roleService.updateRole(req.params.id, req.body);
    sendSuccess(res, role, 'Role updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await roleService.deleteRole(req.params.id);
    sendSuccess(res, null, 'Role deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function listPermissions(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, { catalog: PERMISSION_CATALOG }, 'Permission catalog retrieved successfully');
  } catch (error) {
    next(error);
  }
}
