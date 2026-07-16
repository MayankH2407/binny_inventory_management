import { z } from 'zod';

export const createEcommerceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  marketplace: z.string().trim().max(100).optional().nullable(),
  order_reference: z.string().trim().max(200).optional().nullable(),
  listing_sku: z.string().trim().max(100).optional().nullable(),
  mapped_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  child_box_barcodes: z.array(z.string().transform((s) => s.trim().toUpperCase())).optional(),
  // Whole master cartons scanned in intact (carton stays PACKED; see scanCartonToEcommerce).
  carton_barcodes: z.array(z.string().transform((s) => s.trim().toUpperCase())).optional(),
});

export const addBoxToEcommerceSchema = z.object({
  child_box_id: z.string().uuid(),
  ecommerce_record_id: z.string().uuid(),
});

export const removeBoxFromEcommerceSchema = z.object({
  child_box_id: z.string().uuid(),
  ecommerce_record_id: z.string().uuid(),
});

export const scanCartonToEcommerceSchema = z.object({
  ecommerce_record_id: z.string().uuid(),
  carton_barcode: z.string().min(1, 'Carton barcode is required').transform((s) => s.trim().toUpperCase()),
});

export const ecommerceIdParamSchema = z.object({ id: z.string().uuid() });
export const ecommerceBarcodeParamSchema = z.object({ barcode: z.string().min(1).transform((s) => s.trim().toUpperCase()) });

export const ecommerceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']).optional(),
  search: z.string().trim().optional(),
  marketplace: z.string().trim().optional(),
});

export type CreateEcommerceInput = z.infer<typeof createEcommerceSchema>;
export type AddBoxToEcommerceInput = z.infer<typeof addBoxToEcommerceSchema>;
export type RemoveBoxFromEcommerceInput = z.infer<typeof removeBoxFromEcommerceSchema>;
export type ScanCartonToEcommerceInput = z.infer<typeof scanCartonToEcommerceSchema>;
export type EcommerceListQuery = z.infer<typeof ecommerceListQuerySchema>;
