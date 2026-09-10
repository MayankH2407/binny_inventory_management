import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as dispatchService from '../services/dispatch.service';
import * as csvExportService from '../services/csvExport.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createDispatch(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dispatch = await dispatchService.createDispatch(req.body, req.user!.userId);
    sendSuccess(res, dispatch, 'Dispatch created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getDispatches(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, destination, from_date, to_date, search, return_status } = req.query as {
      page?: number; limit?: number; destination?: string;
      from_date?: string; to_date?: string; search?: string; return_status?: string;
    };
    const result = await dispatchService.getDispatches(
      { destination, from_date, to_date, search, return_status },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Dispatches retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function exportDispatches(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };
    const csv = await csvExportService.exportDispatchCSV(from_date, to_date);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dispatch-report.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

// Same aggregation as exportDispatches, returned as JSON — powers the
// "Download PDF Summary" button on the Dispatches page (browser print-to-PDF
// of a rendered HTML summary, no server-side PDF library involved).
export async function getDispatchSummaryData(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { from_date, to_date } = req.query as { from_date?: string; to_date?: string };
    const rows = await csvExportService.getPartyWiseDispatchRows(from_date, to_date);
    sendSuccess(res, rows, 'Dispatch summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getDispatchById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dispatch = await dispatchService.getDispatchById(req.params.id);
    sendSuccess(res, dispatch, 'Dispatch retrieved successfully');
  } catch (error) {
    next(error);
  }
}
