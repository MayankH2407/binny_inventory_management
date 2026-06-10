import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as ecommerceService from '../services/ecommerce.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createEcommerce(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const record = await ecommerceService.createEcommerce(req.body, req.user!.userId);
    sendSuccess(res, record, 'E-commerce record created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceRecords(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, status, search, marketplace } = req.query as {
      page?: number; limit?: number; status?: string; search?: string; marketplace?: string;
    };
    const result = await ecommerceService.getEcommerceRecords({
      page: page || 1,
      limit: limit || 25,
      status: status as 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED' | undefined,
      search,
      marketplace,
    });
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'E-commerce records retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceStockSummary(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await ecommerceService.getEcommerceStockSummary();
    sendSuccess(res, rows, 'E-commerce stock summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const record = await ecommerceService.getEcommerceById(req.params.id);
    sendSuccess(res, record, 'E-commerce record retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceChildren(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const children = await ecommerceService.getEcommerceChildren(req.params.id);
    sendSuccess(res, children, 'E-commerce record children retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function addBoxToEcommerce(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ecommerceService.addBoxToEcommerce(req.body, req.user!.userId);
    sendSuccess(res, result, 'Child box added to e-commerce record successfully');
  } catch (error) {
    next(error);
  }
}

export async function scanCartonToEcommerce(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { ecommerce_record_id, carton_barcode } = req.body;
    const result = await ecommerceService.scanCartonToEcommerce(ecommerce_record_id, carton_barcode, req.user!.userId);
    sendSuccess(res, result, `${result.added} child box${result.added === 1 ? '' : 'es'} from carton ${result.cartonBarcode} added to e-commerce record`);
  } catch (error) {
    next(error);
  }
}

export async function removeBoxFromEcommerce(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const record = await ecommerceService.removeBoxFromEcommerce(req.body, req.user!.userId);
    sendSuccess(res, record, 'Child box removed from e-commerce record successfully');
  } catch (error) {
    next(error);
  }
}

export async function closeEcommerce(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const record = await ecommerceService.closeEcommerce(req.params.id, req.user!.userId);
    sendSuccess(res, record, 'E-commerce record closed successfully');
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceByBarcode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const record = await ecommerceService.getEcommerceByBarcode(req.params.barcode);
    sendSuccess(res, record, 'E-commerce record retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function fullUnpackEcommerce(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const record = await ecommerceService.fullUnpackEcommerce(req.params.id, req.user!.userId);
    sendSuccess(res, record, 'E-commerce record fully unpacked successfully');
  } catch (error) {
    next(error);
  }
}

export async function getEcommerceAssortment(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await ecommerceService.getEcommerceAssortment(req.params.id);
    sendSuccess(res, summary, 'E-commerce assortment summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}
