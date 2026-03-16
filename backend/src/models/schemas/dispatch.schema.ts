import { z } from 'zod';

export const createDispatchSchema = z.object({
  master_carton_ids: z
    .array(z.string().uuid('Invalid master carton ID format'))
    .min(1, 'At least one master carton must be selected for dispatch')
    .max(200, 'Cannot dispatch more than 200 cartons at once'),
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
});

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
});

export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
