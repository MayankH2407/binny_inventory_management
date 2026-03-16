import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as masterCartonService from '../services/masterCarton.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createMasterCarton(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carton = await masterCartonService.createMasterCarton(req.body, req.user!.userId);
    sendSuccess(res, carton, 'Master carton created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getMasterCartons(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, status, search } = req.query as {
      page?: number; limit?: number; status?: string; search?: string;
    };
    const result = await masterCartonService.getMasterCartons(
      { status, search },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Master cartons retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMasterCartonById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carton = await masterCartonService.getMasterCartonById(req.params.id);
    sendSuccess(res, carton, 'Master carton retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getCartonChildren(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const children = await masterCartonService.getCartonChildren(req.params.id);
    sendSuccess(res, children, 'Carton children retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function packChildBox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { child_box_id, master_carton_id } = req.body;
    const result = await masterCartonService.packChildBox(
      child_box_id,
      master_carton_id,
      req.user!.userId
    );
    sendSuccess(res, result, 'Child box packed into master carton successfully');
  } catch (error) {
    next(error);
  }
}

export async function unpackChildBox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { child_box_id, master_carton_id } = req.body;
    const carton = await masterCartonService.unpackChildBox(
      child_box_id,
      master_carton_id,
      req.user!.userId
    );
    sendSuccess(res, carton, 'Child box unpacked from master carton successfully');
  } catch (error) {
    next(error);
  }
}

export async function repackChildBox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { child_box_id, source_carton_id, destination_carton_id } = req.body;
    const result = await masterCartonService.repackChildBox(
      child_box_id,
      source_carton_id,
      destination_carton_id,
      req.user!.userId
    );
    sendSuccess(res, result, 'Child box repacked successfully');
  } catch (error) {
    next(error);
  }
}

export async function closeMasterCarton(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carton = await masterCartonService.closeMasterCarton(req.params.id, req.user!.userId);
    sendSuccess(res, carton, 'Master carton closed successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMasterCartonByBarcode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carton = await masterCartonService.getMasterCartonByBarcode(req.params.barcode);
    sendSuccess(res, carton, 'Master carton retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function fullUnpackMasterCarton(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carton = await masterCartonService.fullUnpackMasterCarton(req.params.id, req.user!.userId);
    sendSuccess(res, carton, 'Master carton fully unpacked successfully');
  } catch (error) {
    next(error);
  }
}

export async function getAssortmentSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await masterCartonService.getAssortmentSummary(req.params.id);
    sendSuccess(res, summary, 'Assortment summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}
