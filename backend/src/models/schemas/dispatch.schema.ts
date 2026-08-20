import { z } from 'zod';

export const createDispatchSchema = z.object({
  // Master-carton dispatch (original flow): provide an array of carton IDs
  master_carton_ids: z
    .array(z.string().uuid('Invalid master carton ID format'))
    .min(1, 'At least one master carton must be selected for dispatch')
    .max(200, 'Cannot dispatch more than 200 cartons at once')
    .optional(),
  // Sample dispatch: provide a single sample record ID
  sample_record_id: z
    .string()
    .uuid('Invalid sample record ID format')
    .optional(),
  // E-commerce dispatch: scan loose boxes / whole cartons straight out of the
  // E-commerce Area pool (see ecommerce.service.ts#getEcommercePool).
  ecommerce_pool: z
    .object({
      items: z
        .array(
          z.object({
            item_type: z.enum(['BOX', 'CARTON']),
            barcode: z.string().min(1).transform((s) => s.trim().toUpperCase()),
          })
        )
        .min(1, 'Scan at least one item')
        .max(500),
    })
    .optional(),
  reference_name: z.string().trim().max(200).optional(),
  marketplace: z.string().trim().max(100).optional(),
  order_reference: z.string().trim().max(200).optional(),
  listing_sku: z.string().trim().max(100).optional(),
  order_date: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  customer_id: z
    .string()
    .uuid('Invalid customer ID format')
    .optional(),
  destination: z
    .string()
    .max(255, 'Destination must not exceed 255 characters')
    .trim()
    .optional(),
  transport_details: z
    .string()
    .max(1000, 'Transport details must not exceed 1000 characters')
    .trim()
    .optional(),
  lr_number: z
    .string()
    .max(100, 'LR number must not exceed 100 characters')
    .trim()
    .optional(),
  vehicle_number: z
    .string()
    .max(50, 'Vehicle number must not exceed 50 characters')
    .trim()
    .optional(),
  dispatch_date: z
    .string()
    .datetime({ message: 'Invalid date format, expected ISO 8601' })
    .optional(),
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional(),
  // Ship only SOME of a sample's contents — everything else currently in the
  // sample is released back to available stock (not committed to ship later;
  // see sample.service.ts recomputeSampleChildCount / releaseCartonFromSample).
  // release_remainder is a literal `true`, not a default, so this can never
  // happen without the caller (the UI) explicitly acknowledging it in words.
  sample_scope: z
    .object({
      child_box_ids: z.array(z.string().uuid('Invalid child box ID format')).min(1).max(500),
      release_remainder: z.literal(true),
    })
    .optional(),
}).refine(
  (data) => {
    const sources = [
      data.master_carton_ids !== undefined && data.master_carton_ids.length > 0,
      data.sample_record_id !== undefined,
      data.ecommerce_pool !== undefined,
    ].filter(Boolean).length;
    return sources === 1;
  },
  {
    message:
      'Exactly one dispatch source must be provided: master_carton_ids, sample_record_id, or ecommerce_pool',
  }
).refine(
  (data) => {
    const hasEcommerceFields =
      data.reference_name !== undefined ||
      data.marketplace !== undefined ||
      data.order_reference !== undefined ||
      data.listing_sku !== undefined ||
      data.order_date !== undefined;
    return !hasEcommerceFields || data.ecommerce_pool !== undefined;
  },
  {
    message: 'E-commerce fields are only valid with an e-commerce dispatch',
    path: ['marketplace'],
  }
).refine(
  (data) => {
    // Only enforce for master-carton dispatch; sample + ecommerce remain optional
    if (data.master_carton_ids !== undefined && data.master_carton_ids.length > 0) {
      return !!data.customer_id;
    }
    return true;
  },
  {
    message: 'Customer is required for master carton dispatch',
    path: ['customer_id'],
  }
).refine(
  (data) => data.sample_scope === undefined || data.sample_record_id !== undefined,
  {
    message: 'sample_scope can only be used with sample_record_id',
    path: ['sample_scope'],
  }
);

export const dispatchIdParamSchema = z.object({
  id: z.string().uuid('Invalid dispatch ID format'),
});

export const dispatchListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  destination: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
  return_status: z.enum(['none', 'partial', 'full']).optional(),
});

export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
