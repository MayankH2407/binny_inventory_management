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

export async function createBulkMultiSizeChildBoxes(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const childBoxes = await childBoxService.createBulkMultiSizeChildBoxes(req.body, req.user!.userId);
    sendSuccess(res, childBoxes, `${childBoxes.length} child boxes created across multiple sizes`, 201);
  } catch (error) {
    next(error);
  }
}

export async function bulkUploadChildBoxes(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const file = (req as AuthenticatedRequest & { file?: { buffer: Buffer } }).file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No CSV file provided' });
      return;
    }
    const result = await childBoxService.bulkUploadChildBoxesFromCSV(file.buffer, req.user!.userId);
    sendSuccess(res, result, `Bulk upload complete: ${result.created} child boxes created${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`, 201);
  } catch (error) {
    next(error);
  }
}

export async function activateChildBox(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await childBoxService.activateChildBox(req.params.id, req.user!.userId);
    sendSuccess(res, result, 'Child box activated', 200);
  } catch (err) {
    next(err);
  }
}

export function getBulkUploadSample(
  _req: AuthenticatedRequest,
  res: Response,
): void {
  const headers = 'sku,quantity,count';
  const sampleRows = [
    'BFW-MEN-CASUAL-RED-7,1,50',
    'BFW-MEN-CASUAL-RED-8,1,40',
    'BFW-MEN-CASUAL-BLUE-9,1,30',
  ];
  const csv = [headers, ...sampleRows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="child-boxes-bulk-upload-sample.csv"');
  res.send(csv);
}
