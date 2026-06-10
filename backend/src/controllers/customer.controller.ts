import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as customerService from '../services/customer.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createCustomer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isDuplicate = await customerService.checkDuplicateFirmName(req.body.firm_name);
    const customer = await customerService.createCustomer(req.body, req.user!.userId);
    const message = isDuplicate
      ? 'Customer created successfully. Note: A customer with this firm name already exists.'
      : 'Customer created successfully';
    sendSuccess(res, customer, message, 201);
  } catch (error) {
    next(error);
  }
}

export async function getCustomers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, search, is_active, customer_type } = req.query as {
      page?: number; limit?: number; search?: string; is_active?: boolean; customer_type?: string;
    };
    const result = await customerService.getCustomers(
      { search, is_active, customer_type },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Customers retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getCustomerById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customer = await customerService.getCustomerById(req.params.id);
    sendSuccess(res, customer, 'Customer retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateCustomer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body, req.user!.userId);
    sendSuccess(res, customer, 'Customer updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await customerService.deleteCustomer(req.params.id, req.user!.userId);
    sendSuccess(res, null, 'Customer deactivated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getPrimaryDealers(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dealers = await customerService.getPrimaryDealers();
    sendSuccess(res, dealers, 'Primary dealers retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSubDealers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const dealers = await customerService.getSubDealers(id);
    sendSuccess(res, dealers, 'Sub dealers retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function bulkUploadCustomers(
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

    const result = await customerService.bulkCreateCustomers(file.buffer, req.user!.userId);
    sendSuccess(res, result, `Bulk upload complete: ${result.created} customers created${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`, 201);
  } catch (error) {
    next(error);
  }
}

export function downloadCustomerSampleCsv(
  _req: AuthenticatedRequest,
  res: Response,
): void {
  const headers = [
    'firm_name', 'address', 'delivery_location', 'gstin', 'private_marka',
    'gr', 'contact_person_name', 'contact_person_mobile', 'customer_type', 'primary_dealer_name',
  ];
  const sampleRows = [
    ['Acme Footwear', '12 MG Road, Jaipur', 'Jaipur', '22AAAAA0000A1Z5', 'ACME', 'GR-001', 'Ramesh', '9876543210', 'Primary Dealer', ''],
    ['Acme Sub Store', '5 Station Road, Ajmer', 'Ajmer', '', '', 'GR-002', 'Suresh', '9876500000', 'Sub Dealer', 'Acme Footwear'],
  ];
  const csv = [headers.join(','), ...sampleRows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=customer_upload_sample.csv');
  res.send(csv);
}
