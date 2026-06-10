import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as inventoryService from '../services/inventory.service';
import * as csvExportService from '../services/csvExport.service';
import { sendSuccess, sendPaginated } from '../utils/response';
import { InventoryBreakdownInput } from '../models/schemas/inventory.schema';

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

export async function getStockHierarchy(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { level, section, article_name, mrp, colour } = req.query as {
      level?: string; section?: string; article_name?: string; mrp?: string; colour?: string;
    };
    const validLevels = ['section', 'article_name', 'mrp', 'colour', 'product'];
    const stockLevel = (validLevels.includes(level || '') ? level : 'section') as 'section' | 'article_name' | 'mrp' | 'colour' | 'product';
    const result = await inventoryService.getStockByLevel(stockLevel, { section, article_name, mrp, colour });
    sendSuccess(res, result, 'Stock hierarchy retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getStockSummary(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await inventoryService.getStockSummary();
    sendSuccess(res, summary, 'Stock summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getCartonHierarchy(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { level, status, section, article_name, search, page, limit } = req.query as {
      level?: string;
      status?: string;
      section?: string;
      article_name?: string;
      search?: string;
      page?: number;
      limit?: number;
    };
    const validLevels = ['status', 'section', 'article_name', 'carton'];
    const cartonLevel = (validLevels.includes(level || '') ? level : 'status') as 'status' | 'section' | 'article_name' | 'carton';
    const result = await inventoryService.getCartonHierarchy(cartonLevel, { status, section, article_name, search, page, limit });
    res.json({ success: true, message: 'Carton hierarchy retrieved successfully', ...result });
  } catch (error) {
    next(error);
  }
}

export async function exportCartonHierarchyCsv(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { level, status, section, article_name, search } = req.query as {
      level?: string;
      status?: string;
      section?: string;
      article_name?: string;
      search?: string;
    };
    const validLevels = ['status', 'section', 'article_name', 'carton'];
    const cartonLevel = (validLevels.includes(level || '') ? level : 'status') as 'status' | 'section' | 'article_name' | 'carton';
    const csv = await csvExportService.exportCartonHierarchyCSV(cartonLevel, { status, section, article_name, search });
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="carton-hierarchy-${cartonLevel}-${today}.csv"`);
    res.send(csv);
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

export async function getInventoryBreakdown(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Query has already been validated + coerced by the validate middleware
    const input = req.query as unknown as InventoryBreakdownInput;
    const result = await inventoryService.getInventoryBreakdown(input);
    sendSuccess(res, result, 'Inventory breakdown retrieved successfully');
  } catch (error) {
    next(error);
  }
}
