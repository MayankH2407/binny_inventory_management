import { z } from 'zod';

// Samples pool redesign (2026-09) — a sample record is now lightweight: just a
// barcode + optional name. Recipient/customer/purpose/date all move to
// dispatch time (see dispatch.schema.ts's sample_dispatch group).
export const createSampleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional().nullable(),
});

export const sampleIdParamSchema = z.object({
  id: z.string().uuid('Invalid sample record ID format'),
});

export const sampleBarcodeParamSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required').transform((s) => s.trim().toUpperCase()),
});

export const sampleLookupBarcodeParamSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required').transform((s) => s.trim().toUpperCase()),
});

// Scan a barcode into a sample record — resolves box vs. carton server-side,
// mirrors POST /ecommerce/pool/scan. `foot` is ignored for a CARTON scan.
export const sampleScanSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required').transform((s) => s.trim().toUpperCase()),
  foot: z.enum(['LEFT', 'RIGHT', 'PAIR']).default('PAIR'),
});

// Unpack a whole reserved carton, all-or-nothing (mirrors POST
// /ecommerce/pool/unpack-carton). mapping_id is the sample_carton_mapping row.
export const sampleUnpackSchema = z.object({
  mapping_id: z.string().uuid('Invalid mapping ID format'),
});

// Remove a loose box or a reserved carton back to stock. One endpoint handles
// both, branching server-side on item_type (mirrors POST /ecommerce/pool/remove).
export const sampleItemActionSchema = z.object({
  item_type: z.enum(['BOX', 'CARTON']),
  mapping_id: z.string().uuid('Invalid mapping ID format'),
});

// Change the foot designation on an existing loose mapping (e.g. "send just
// the left shoe") — the one capability with no e-commerce equivalent.
export const sampleSetFootSchema = z.object({
  mapping_id: z.string().uuid('Invalid mapping ID format'),
  foot: z.enum(['LEFT', 'RIGHT', 'PAIR']),
});

export const sampleListQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 25)),
  // OPEN = not yet dispatched (EMPTY or has open contents) — the "Samples Area"
  // tab. DISPATCHED = the "Sent" tab. EMPTY is available too for completeness.
  state: z.enum(['EMPTY', 'OPEN', 'DISPATCHED']).optional(),
  search: z.string().optional(),
});

export type CreateSampleInput = z.infer<typeof createSampleSchema>;
export type SampleScanInput = z.infer<typeof sampleScanSchema>;
export type SampleUnpackInput = z.infer<typeof sampleUnpackSchema>;
export type SampleItemActionInput = z.infer<typeof sampleItemActionSchema>;
export type SampleSetFootInput = z.infer<typeof sampleSetFootSchema>;
export type SampleListQuery = z.infer<typeof sampleListQuerySchema>;
