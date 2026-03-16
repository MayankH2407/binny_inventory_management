import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as dispatchService from '../services/dispatch.service';
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
    const { page, limit, destination, from_date, to_date, search } = req.query as {
      page?: number; limit?: number; destination?: string;
      from_date?: string; to_date?: string; search?: string;
    };
    const result = await dispatchService.getDispatches(
      { destination, from_date, to_date, search },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Dispatches retrieved successfully');
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
