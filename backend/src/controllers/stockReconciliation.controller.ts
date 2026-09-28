import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as stockReconService from '../services/stockReconciliation.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function openSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.openSession(req.body, req.user!.userId);
    sendSuccess(res, session, 'Stock reconciliation session opened', 201);
  } catch (error) {
    next(error);
  }
}

export async function getSessions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, status } = req.query as { page?: number; limit?: number; status?: string };
    const result = await stockReconService.getSessions({ status }, page || 1, limit || 25);
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Sessions retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSessionById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.getSessionById(req.params.id);
    sendSuccess(res, session, 'Session retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getProgress(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const progress = await stockReconService.getProgress(req.params.id);
    sendSuccess(res, progress, 'Progress retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getScans(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = req.query as { page?: number; limit?: number };
    const result = await stockReconService.getSessionScans(req.params.id, page || 1, limit || 200);
    sendPaginated(res, result.data, result.total, page || 1, limit || 200, 'Scan history retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function submitScans(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await stockReconService.submitScans(req.params.id, req.body.scans, req.user!.userId);
    sendSuccess(res, result, 'Scans recorded');
  } catch (error) {
    next(error);
  }
}

export async function getVariance(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { format } = req.query as { format?: string };
    if (format === 'csv') {
      const csv = await stockReconService.getVarianceCSV(req.params.id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="stock-reconciliation-variance.csv"');
      res.send(csv);
      return;
    }
    const variance = await stockReconService.getVariance(req.params.id);
    sendSuccess(res, variance, 'Variance report retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function submitSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.submitSession(req.params.id, req.user!.userId);
    sendSuccess(res, session, 'Session submitted for approval');
  } catch (error) {
    next(error);
  }
}

export async function cancelSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.cancelSession(req.params.id, req.user!.userId);
    sendSuccess(res, session, 'Session cancelled');
  } catch (error) {
    next(error);
  }
}

export async function approveSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.approveSession(req.params.id, req.user!.userId);
    sendSuccess(res, session, 'Session approved');
  } catch (error) {
    next(error);
  }
}

export async function rejectSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.rejectSession(req.params.id, req.body, req.user!.userId);
    sendSuccess(res, session, 'Session rejected');
  } catch (error) {
    next(error);
  }
}

export async function postSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.postSession(req.params.id, req.user!.userId);
    sendSuccess(res, session, 'Session posted — stock corrections applied');
  } catch (error) {
    next(error);
  }
}

export async function recountSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await stockReconService.recountSession(req.params.id, req.user!.userId);
    sendSuccess(res, session, 'Recount session opened', 201);
  } catch (error) {
    next(error);
  }
}
