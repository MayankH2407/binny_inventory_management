import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as returnService from '../services/return.service';
import * as csvExportService from '../services/csvExport.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createReturn(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const returnRecord = await returnService.createReturn(req.body, req.user!.userId);
    sendSuccess(res, returnRecord, 'Return created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getReturns(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, from_date, to_date, search } = req.query as {
      page?: number; limit?: number; from_date?: string; to_date?: string; search?: string;
    };
    const result = await returnService.getReturns(
      { from_date, to_date, search },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Returns retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function exportReturns(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };
    const csv = await csvExportService.exportReturnCSV(from_date, to_date);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="return-report.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

export async function getReturnById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const returnRecord = await returnService.getReturnById(req.params.id);
    sendSuccess(res, returnRecord, 'Return retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function lookupReturnable(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await returnService.lookupReturnable(req.params.barcode);
    sendSuccess(res, result, 'Lookup successful');
  } catch (error) {
    next(error);
  }
}

export async function getDispatchItems(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await returnService.getDispatchReturnableItems(req.params.id);
    sendSuccess(res, result, 'Dispatch returnable items retrieved successfully');
  } catch (error) {
    next(error);
  }
}
