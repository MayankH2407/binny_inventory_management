import { z } from 'zod';

export const createSampleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  customer_id: z.string().uuid().optional().nullable(),
  recipient_name: z.string().trim().max(200).optional().nullable(),
  purpose: z.string().trim().max(2000).optional().nullable(),
  sample_date: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional()
    .nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  child_box_barcodes: z.array(z.string().transform((s) => s.trim().toUpperCase())).optional(),
  // Optional per-barcode foot, keyed by child-box barcode (LEFT/RIGHT/PAIR). Missing entries default to PAIR.
  box_feet: z.record(z.enum(['LEFT', 'RIGHT', 'PAIR'])).optional(),
  // Whole master cartons scanned in intact (carton stays PACKED; see scanCartonToSample).
  carton_barcodes: z.array(z.string().transform((s) => s.trim().toUpperCase())).optional(),
});

export const scanCartonToSampleSchema = z.object({
  sample_record_id: z.string().uuid('Invalid sample record ID format'),
  carton_barcode: z.string().min(1, 'Carton barcode is required').transform((s) => s.trim().toUpperCase()),
});

export const addBoxToSampleSchema = z.object({
  child_box_id: z.string().uuid('Invalid child box ID format'),
  sample_record_id: z.string().uuid('Invalid sample record ID format'),
  // Samples can be dispatched as a single foot rather than a pair.
  foot: z.enum(['LEFT', 'RIGHT', 'PAIR']).default('PAIR'),
});

export const removeBoxFromSampleSchema = z.object({
  child_box_id: z.string().uuid('Invalid child box ID format'),
  sample_record_id: z.string().uuid('Invalid sample record ID format'),
});

export const sampleIdParamSchema = z.object({
  id: z.string().uuid('Invalid sample record ID format'),
});

export const sampleBarcodeParamSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required').transform((s) => s.trim().toUpperCase()),
});

export const sampleListQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 25)),
  status: z.enum(['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']).optional(),
  search: z.string().optional(),
  customer_id: z.string().uuid().optional(),
});

export type CreateSampleInput = z.infer<typeof createSampleSchema>;
export type AddBoxToSampleInput = z.infer<typeof addBoxToSampleSchema>;
export type RemoveBoxFromSampleInput = z.infer<typeof removeBoxFromSampleSchema>;
export type ScanCartonToSampleInput = z.infer<typeof scanCartonToSampleSchema>;
export type SampleListQuery = z.infer<typeof sampleListQuerySchema>;
