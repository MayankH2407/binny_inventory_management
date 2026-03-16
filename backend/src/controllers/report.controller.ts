import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as reportService from '../services/report.service';
import * as csvExportService from '../services/csvExport.service';
import { sendSuccess } from '../utils/response';
import { BadRequestError } from '../utils/errors';

export async function getInventorySummary(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await reportService.getInventorySummary();
    sendSuccess(res, summary, 'Inventory summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getProductWiseReport(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const report = await reportService.getProductWiseReport();
    sendSuccess(res, report, 'Product-wise report retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getDispatchSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };
    const summary = await reportService.getDispatchSummary(from_date, to_date);
    sendSuccess(res, summary, 'Dispatch summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getDailyActivity(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };

    if (!from_date || !to_date) {
      throw new BadRequestError('Both from_date and to_date are required');
    }

    const report = await reportService.getDailyActivity(from_date, to_date);
    sendSuccess(res, report, 'Daily activity report retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getCartonInventoryReport(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const report = await reportService.getCartonInventoryReport();
    sendSuccess(res, report, 'Carton inventory report retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function exportInventoryCSV(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const csv = await csvExportService.exportInventorySummaryCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-summary.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

export async function exportDispatchCSV(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };
    const csv = await csvExportService.exportDispatchCSV(from_date, to_date);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dispatch-summary.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

export async function exportDailyActivityCSV(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };

    if (!from_date || !to_date) {
      throw new BadRequestError('Both from_date and to_date are required');
    }

    const csv = await csvExportService.exportDailyActivityCSV(from_date, to_date);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="daily-activity.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}
