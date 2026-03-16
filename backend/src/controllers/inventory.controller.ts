import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as inventoryService from '../services/inventory.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function traceByBarcode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await inventoryService.traceByBarcode(req.params.barcode);
    sendSuccess(res, result, 'Trace result retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getDashboard(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dashboard = await inventoryService.getDashboard();
    sendSuccess(res, dashboard, 'Dashboard data retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getTransactions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      page, limit, transaction_type, child_box_id, master_carton_id,
      performed_by, from_date, to_date,
    } = req.query as {
      page?: number; limit?: number; transaction_type?: string;
      child_box_id?: string; master_carton_id?: string; performed_by?: string;
      from_date?: string; to_date?: string;
    };

    const result = await inventoryService.getTransactions(
      { transaction_type, child_box_id, master_carton_id, performed_by, from_date, to_date },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Transactions retrieved successfully');
  } catch (error) {
    next(error);
  }
}
