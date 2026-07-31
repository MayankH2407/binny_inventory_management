import { z } from 'zod';

export const createSampleSchema = z.object({
  // Optional — if omitted the service generates a sensible default
  // ("<customer firm name> · <date>" or "Sample <SR-barcode>").
  name: z.string().trim().min(1).max(200).optional(),
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

// mapping_id is preferred and unambiguous (a sample can legitimately hold both feet
// of one box as two separate mappings, so child_box_id alone can be ambiguous).
// child_box_id is kept for back-compat with any existing callers.
export const removeBoxFromSampleSchema = z
  .object({
    sample_record_id: z.string().uuid('Invalid sample record ID format'),
    mapping_id: z.string().uuid('Invalid mapping ID format').optional(),
    child_box_id: z.string().uuid('Invalid child box ID format').optional(),
  })
  .refine((d) => !!(d.mapping_id || d.child_box_id), {
    message: 'mapping_id or child_box_id is required',
  });

// Take specific boxes out of a whole-carton allocation — they become loose,
// individually-tracked sample items (foot-splittable), leaving the rest of the
// carton (if any remains) still reserved for this sample.
export const takeOutCartonBoxesSchema = z.object({
  sample_record_id: z.string().uuid('Invalid sample record ID format'),
  master_carton_id: z.string().uuid('Invalid master carton ID format'),
  child_box_ids: z.array(z.string().uuid('Invalid child box ID format')).min(1).max(200),
  // Optional per-box foot, keyed by child_box_id. Missing entries default to PAIR.
  box_feet: z.record(z.enum(['LEFT', 'RIGHT', 'PAIR'])).optional(),
  // If true, also release the remainder of the carton back to stock (e.g. "keep these
  // 2 boxes, the rest of the carton goes back"). Defaults to false (keep reserved).
  release_carton: z.boolean().default(false),
});

// The missing inverse of scan-carton — releases a whole carton allocation back to
// stock untouched (nothing inside it was ever modified when it was allocated).
export const removeCartonFromSampleSchema = z.object({
  sample_record_id: z.string().uuid('Invalid sample record ID format'),
  master_carton_id: z.string().uuid('Invalid master carton ID format'),
});

// Change the foot designation on an existing loose mapping (e.g. "send just the left
// shoe" as a deliberate action after the box is already in the sample).
export const setBoxFootSchema = z.object({
  sample_record_id: z.string().uuid('Invalid sample record ID format'),
  mapping_id: z.string().uuid('Invalid mapping ID format'),
  foot: z.enum(['LEFT', 'RIGHT', 'PAIR']),
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
export type TakeOutCartonBoxesInput = z.infer<typeof takeOutCartonBoxesSchema>;
export type RemoveCartonFromSampleInput = z.infer<typeof removeCartonFromSampleSchema>;
export type SetBoxFootInput = z.infer<typeof setBoxFootSchema>;
export type SampleListQuery = z.infer<typeof sampleListQuerySchema>;
