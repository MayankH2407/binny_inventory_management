import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as customerService from '../services/customer.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createCustomer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isDuplicate = await customerService.checkDuplicateFirmName(req.body.firm_name);
    const customer = await customerService.createCustomer(req.body, req.user!.userId);
    const message = isDuplicate
      ? 'Customer created successfully. Note: A customer with this firm name already exists.'
      : 'Customer created successfully';
    sendSuccess(res, customer, message, 201);
  } catch (error) {
    next(error);
  }
}

export async function getCustomers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, search, is_active, customer_type } = req.query as {
      page?: number; limit?: number; search?: string; is_active?: boolean; customer_type?: string;
    };
    const result = await customerService.getCustomers(
      { search, is_active, customer_type },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Customers retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getCustomerById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    sendSuccess(res, customer, 'Customer retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateCustomer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body, req.user!.userId);
    sendSuccess(res, customer, 'Customer updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await customerService.deleteCustomer(req.params.id, req.user!.userId);
    sendSuccess(res, null, 'Customer deactivated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getPrimaryDealers(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dealers = await customerService.getPrimaryDealers();
    sendSuccess(res, dealers, 'Primary dealers retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSubDealers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const dealers = await customerService.getSubDealers(id);
    sendSuccess(res, dealers, 'Sub dealers retrieved successfully');
  } catch (error) {
    next(error);
  }
}
