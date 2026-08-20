import { z } from 'zod';

export const ecommerceIdParamSchema = z.object({ id: z.string().uuid() });
export const ecommerceBarcodeParamSchema = z.object({ barcode: z.string().min(1).transform((s) => s.trim().toUpperCase()) });

export const ecommerceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']).optional(),
  search: z.string().trim().optional(),
  marketplace: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// E-commerce pool schemas — the pool redesign replaces record-scoped
// add/remove/close/full-unpack flows with a single unordered pool of loose
// boxes / whole cartons sitting in the E-commerce Area (see
// ecommerce.service.ts#getEcommercePool and friends).
// ---------------------------------------------------------------------------
export const poolScanSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required').transform((s) => s.trim().toUpperCase()),
});

export const poolItemActionSchema = z.object({
  item_type: z.enum(['BOX', 'CARTON']),
  mapping_id: z.string().uuid(),
});

export const poolUnpackSchema = z.object({
  mapping_id: z.string().uuid(),
});

export const poolListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().optional(),
  item_type: z.enum(['BOX', 'CARTON']).optional(),
});

export const poolBarcodeParamSchema = z.object({
  barcode: z.string().min(1).transform((s) => s.trim().toUpperCase()),
});

export type EcommerceListQuery = z.infer<typeof ecommerceListQuerySchema>;
export type PoolScanInput = z.infer<typeof poolScanSchema>;
export type PoolItemActionInput = z.infer<typeof poolItemActionSchema>;
export type PoolUnpackInput = z.infer<typeof poolUnpackSchema>;
export type PoolListQuery = z.infer<typeof poolListQuerySchema>;
