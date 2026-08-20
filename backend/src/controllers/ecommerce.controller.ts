import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as ecommerceService from '../services/ecommerce.service';
import { sendSuccess, sendPaginated } from '../utils/response';

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

export async function getEcommerceSummary(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await ecommerceService.getEcommerceSummary();
    sendSuccess(res, summary, 'E-commerce summary retrieved successfully');
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

export async function getEcommerceCartons(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cartons = await ecommerceService.getEcommerceCartons(req.params.id);
    sendSuccess(res, cartons, 'E-commerce cartons retrieved successfully');
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

// ---------------------------------------------------------------------------
// E-commerce pool
// ---------------------------------------------------------------------------
export async function getEcommercePool(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, search, item_type } = req.query as {
      page?: number; limit?: number; search?: string; item_type?: 'BOX' | 'CARTON';
    };
    const result = await ecommerceService.getEcommercePool({
      page: page || 1,
      limit: limit || 50,
      search,
      item_type,
    });
    sendPaginated(res, result.data, result.total, page || 1, limit || 50, 'E-commerce pool retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getEcommercePoolSummary(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await ecommerceService.getEcommercePoolSummary();
    sendSuccess(res, summary, 'E-commerce pool summary retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function lookupEcommercePoolItem(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ecommerceService.lookupEcommercePoolItem(req.params.barcode);
    sendSuccess(res, result, 'E-commerce pool lookup complete');
  } catch (error) {
    next(error);
  }
}

export async function addToEcommercePool(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ecommerceService.addToEcommercePool(req.body.barcode, req.user!.userId);
    sendSuccess(res, result, `${result.item_type === 'CARTON' ? 'Carton' : 'Child box'} ${result.barcode} added to the E-commerce Area`);
  } catch (error) {
    next(error);
  }
}

export async function removeFromEcommercePool(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ecommerceService.removeFromEcommercePool(req.body, req.user!.userId);
    sendSuccess(res, result, `${result.item_type === 'CARTON' ? 'Carton' : 'Child box'} ${result.barcode} removed from the E-commerce Area`);
  } catch (error) {
    next(error);
  }
}

export async function unpackCartonInEcommercePool(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await ecommerceService.unpackCartonInEcommercePool(req.body.mapping_id, req.user!.userId);
    sendSuccess(res, result, `Carton ${result.carton_barcode} unpacked into ${result.boxes_unpacked} loose boxes in the E-commerce Area`);
  } catch (error) {
    next(error);
  }
}
