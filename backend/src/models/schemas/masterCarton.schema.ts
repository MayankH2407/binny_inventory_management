import { z } from 'zod';
import { MASTER_CARTON_STATUS } from '../../config/constants';

const statusValues = Object.values(MASTER_CARTON_STATUS) as [string, ...string[]];

export const createMasterCartonSchema = z.object({
  max_capacity: z
    .number()
    .int('Max capacity must be a whole number')
    .positive('Max capacity must be positive')
    .max(100, 'Max capacity must not exceed 100')
    .optional()
    .default(50),
  child_box_barcodes: z.array(z.string()).optional().default([]),
});

export const packChildBoxSchema = z.object({
  child_box_id: z.string().uuid('Invalid child box ID format'),
  master_carton_id: z.string().uuid('Invalid master carton ID format'),
});

export const unpackChildBoxSchema = z.object({
  child_box_id: z.string().uuid('Invalid child box ID format'),
  master_carton_id: z.string().uuid('Invalid master carton ID format'),
});

export const repackChildBoxSchema = z.object({
  child_box_id: z.string().uuid('Invalid child box ID format'),
  source_carton_id: z.string().uuid('Invalid source carton ID format'),
  destination_carton_id: z.string().uuid('Invalid destination carton ID format'),
});

export const masterCartonIdParamSchema = z.object({
  id: z.string().uuid('Invalid master carton ID format'),
});

export const masterCartonListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  status: z.enum(statusValues).optional(),
  search: z.string().optional(),
});

export const masterCartonBarcodeParamSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required'),
});

export type CreateMasterCartonInput = z.infer<typeof createMasterCartonSchema>;
export type PackChildBoxInput = z.infer<typeof packChildBoxSchema>;
export type UnpackChildBoxInput = z.infer<typeof unpackChildBoxSchema>;
export type RepackChildBoxInput = z.infer<typeof repackChildBoxSchema>;
