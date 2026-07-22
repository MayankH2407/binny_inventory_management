import { z } from 'zod';

export const createReturnSchema = z.object({
  dispatch_record_id: z
    .string()
    .uuid('Invalid dispatch record ID format')
    .optional(),
  customer_id: z
    .string()
    .uuid('Invalid customer ID format')
    .optional(),
  return_date: z
    .string()
    .datetime({ message: 'Invalid date format, expected ISO 8601' })
    .optional(),
  reason: z
    .string()
    .max(1000, 'Reason must not exceed 1000 characters')
    .optional(),
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional(),
  items: z
    .array(
      z.object({
        barcode: z.string().min(1, 'Barcode is required').trim(),
        item_type: z.enum(['BOX', 'CARTON']),
      })
    )
    .min(1, 'At least one item must be returned')
    .max(500, 'Cannot return more than 500 items at once'),
});

export const returnIdParamSchema = z.object({
  id: z.string().uuid('Invalid return ID format'),
});

export const returnListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
});

export const lookupBarcodeParamSchema = z.object({
  barcode: z.string().min(1, 'Barcode is required'),
});

export const dispatchItemsParamSchema = z.object({
  id: z.string().uuid('Invalid dispatch record ID format'),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
