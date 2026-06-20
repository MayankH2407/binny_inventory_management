import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as masterCartonService from '../services/masterCarton.service';
import * as legacyCartonService from '../services/legacyCarton.service';
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
    const { page, limit, status, search, includeLegacy } = req.query as {
      page?: number; limit?: number; status?: string; search?: string; includeLegacy?: boolean;
    };
    const is_legacy = includeLegacy === true ? true : includeLegacy === false ? false : undefined;
    const result = await masterCartonService.getMasterCartons(
      { status, search, is_legacy },
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

export async function packChildBoxByBarcode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { barcode, master_carton_id } = req.body;
    const result = await masterCartonService.packChildBoxByBarcode(
      barcode,
      master_carton_id,
      req.user!.userId
    );
    const message = result.alreadyPacked
      ? `Box ${result.childBoxBarcode} is already in this carton`
      : `Packed ${result.childBoxBarcode} into carton`;
    sendSuccess(res, result, message);
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

export async function openLegacyCarton(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carton = await masterCartonService.openLegacyCarton(req.params.id, req.user!.userId);
    sendSuccess(res, carton, 'Legacy carton opened for repacking');
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

export async function bulkUploadLegacyCartons(
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

    const result = await legacyCartonService.bulkCreateLegacyCartons(file.buffer, req.user!.userId);
    sendSuccess(
      res,
      result,
      `Legacy carton upload complete: ${result.cartons_created} cartons created across ${result.rows_processed} rows${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`,
      201
    );
  } catch (error) {
    next(error);
  }
}

export function downloadLegacySampleCsv(
  _req: AuthenticatedRequest,
  res: Response,
): void {
  // COLOUR / MRP cells may hold multiple comma-separated values, so they are
  // CSV-quoted here (Excel does this automatically when the cell has a comma).
  const csv = [
    'SECTION,CATEGORY,ARTICLE NAME,COLOUR,MRP,SIZE FROM,SIZE TO,MASTER CARTON QUANTITY,PAIRS PER CARTON',
    'Hawaii,Ladies,ALIA PLUS,"black, red","100, 150",6,10,20,48',
    'Hawaii,Gents,BUSKER 01-20,brown,349,6,10,10,48',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=legacy_carton_upload_sample.csv');
  res.send(csv);
}
