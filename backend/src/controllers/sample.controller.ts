import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as sampleService from '../services/sample.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sample = await sampleService.createSampleRecord(req.body, req.user!.userId);
    sendSuccess(res, sample, 'Sample record created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getSampleSummary(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await sampleService.getSampleSummary();
    sendSuccess(res, summary, 'Sample summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSamples(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, state, search } = req.query as {
      page?: number;
      limit?: number;
      state?: 'EMPTY' | 'OPEN' | 'DISPATCHED';
      search?: string;
    };
    const result = await sampleService.getSamples({ search, state }, page || 1, limit || 25);
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Sample records retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSampleById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sample = await sampleService.getSampleById(req.params.id);
    sendSuccess(res, sample, 'Sample record retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSampleByBarcode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sample = await sampleService.getSampleByBarcode(req.params.barcode);
    sendSuccess(res, sample, 'Sample record retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function lookupSampleItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await sampleService.lookupSampleItem(req.params.barcode);
    sendSuccess(res, result, 'Lookup complete');
  } catch (error) {
    next(error);
  }
}

export async function getSampleContents(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const items = await sampleService.getSampleContents(req.params.id);
    sendSuccess(res, items, 'Sample contents retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSampleAssortment(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await sampleService.getSampleAssortment(req.params.id);
    sendSuccess(res, summary, 'Sample assortment retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function addToSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { barcode, foot } = req.body;
    const result = await sampleService.addToSample({ sampleRecordId: req.params.id, barcode, foot }, req.user!.userId);
    sendSuccess(res, result, `${result.item_type === 'CARTON' ? 'Carton' : 'Box'} added to sample record successfully`);
  } catch (error) {
    next(error);
  }
}

export async function unpackCartonInSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { mapping_id } = req.body;
    const result = await sampleService.unpackCartonInSample({ sampleRecordId: req.params.id, mappingId: mapping_id }, req.user!.userId);
    sendSuccess(res, result, `Carton ${result.carton_barcode} unpacked (${result.boxes_unpacked} boxes)`);
  } catch (error) {
    next(error);
  }
}

export async function removeFromSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { item_type, mapping_id } = req.body;
    const result = await sampleService.removeFromSample({ sampleRecordId: req.params.id, itemType: item_type, mappingId: mapping_id }, req.user!.userId);
    sendSuccess(res, result, `${result.item_type === 'CARTON' ? 'Carton' : 'Box'} removed from sample record successfully`);
  } catch (error) {
    next(error);
  }
}

export async function setBoxFoot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { mapping_id, foot } = req.body;
    const result = await sampleService.setBoxFoot({ sampleRecordId: req.params.id, mappingId: mapping_id, foot }, req.user!.userId);
    sendSuccess(res, result, 'Box foot updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function clearSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await sampleService.clearSample(req.params.id, req.user!.userId);
    sendSuccess(res, result, 'Sample record cleared successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteSampleRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await sampleService.deleteSampleRecord(req.params.id, req.user!.userId);
    sendSuccess(res, null, 'Sample record deleted successfully');
  } catch (error) {
    next(error);
  }
}
