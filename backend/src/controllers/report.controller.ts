import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as reportService from '../services/report.service';
import * as csvExportService from '../services/csvExport.service';
import { sendSuccess } from '../utils/response';
import { BadRequestError } from '../utils/errors';
import { SampleStatus, EcommerceStatus } from '../config/constants';

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

export async function getSampleReport(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from, to, status, customer_id } = req.query as {
      from?: string; to?: string; status?: string; customer_id?: string;
    };
    const report = await reportService.getSampleReport({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: status as SampleStatus | undefined,
      customer_id,
    });
    sendSuccess(res, report, 'Sample report retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function exportSampleReportCSV(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from, to, status, customer_id } = req.query as {
      from?: string; to?: string; status?: string; customer_id?: string;
    };
    const csv = await csvExportService.exportSampleReportCSV({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: status as SampleStatus | undefined,
      customer_id,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sample-report.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceReport(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from, to, status, marketplace } = req.query as {
      from?: string; to?: string; status?: string; marketplace?: string;
    };
    const report = await reportService.getEcommerceReport({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: status as EcommerceStatus | undefined,
      marketplace,
    });
    sendSuccess(res, report, 'E-commerce report retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function exportEcommerceReportCSV(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from, to, status, marketplace } = req.query as {
      from?: string; to?: string; status?: string; marketplace?: string;
    };
    const csv = await csvExportService.exportEcommerceReportCSV({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status: status as EcommerceStatus | undefined,
      marketplace,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ecommerce-report.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}
