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
    const sample = await sampleService.createSample(req.body, req.user!.userId);
    sendSuccess(res, sample, 'Sample record created successfully', 201);
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
    const { page, limit, status, search, customer_id } = req.query as {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
      customer_id?: string;
    };
    const result = await sampleService.getSamples(
      { status, search, customer_id },
      page || 1,
      limit || 25
    );
    sendPaginated(
      res,
      result.data,
      result.total,
      page || 1,
      limit || 25,
      'Sample records retrieved successfully'
    );
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

export async function getSampleChildren(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const children = await sampleService.getSampleChildren(req.params.id);
    sendSuccess(res, children, 'Sample children retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function addBoxToSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { child_box_id, sample_record_id, foot } = req.body;
    const result = await sampleService.addBoxToSample(
      { child_box_id, sample_record_id, foot: foot ?? 'PAIR' },
      req.user!.userId
    );
    sendSuccess(res, result, 'Child box added to sample record successfully');
  } catch (error) {
    next(error);
  }
}

export async function removeBoxFromSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { child_box_id, sample_record_id } = req.body;
    const sample = await sampleService.removeBoxFromSample(
      { child_box_id, sample_record_id },
      req.user!.userId
    );
    sendSuccess(res, sample, 'Child box removed from sample record successfully');
  } catch (error) {
    next(error);
  }
}

export async function closeSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sample = await sampleService.closeSample(req.params.id, req.user!.userId);
    sendSuccess(res, sample, 'Sample record closed successfully');
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

export async function fullUnpackSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sample = await sampleService.fullUnpackSample(req.params.id, req.user!.userId);
    sendSuccess(res, sample, 'Sample record fully unpacked successfully');
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
