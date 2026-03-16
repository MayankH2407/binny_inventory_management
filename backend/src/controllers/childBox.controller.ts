import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as childBoxService from '../services/childBox.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createChildBox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const childBox = await childBoxService.createChildBox(req.body, req.user!.userId);
    sendSuccess(res, childBox, 'Child box created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function createBulkChildBoxes(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const childBoxes = await childBoxService.createBulkChildBoxes(req.body, req.user!.userId);
    sendSuccess(res, childBoxes, `${childBoxes.length} child boxes created successfully`, 201);
  } catch (error) {
    next(error);
  }
}

export async function getChildBoxes(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, status, product_id, search } = req.query as {
      page?: number; limit?: number; status?: string; product_id?: string;
      search?: string;
    };
    const result = await childBoxService.getChildBoxes(
      { status, product_id, search },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Child boxes retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getChildBoxById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const childBox = await childBoxService.getChildBoxById(req.params.id);
    sendSuccess(res, childBox, 'Child box retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getChildBoxByQR(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const qrCode = req.params.qrCode;
    const childBox = await childBoxService.getChildBoxByQR(qrCode);
    sendSuccess(res, childBox, 'Child box retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getFreeChildBoxes(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, product_id } = req.query as {
      page?: number; limit?: number; product_id?: string;
    };
    const result = await childBoxService.getFreeChildBoxes(
      product_id,
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Free child boxes retrieved successfully');
  } catch (error) {
    next(error);
  }
}
