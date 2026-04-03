import { z } from 'zod';
import { CHILD_BOX_STATUS } from '../../config/constants';

const statusValues = Object.values(CHILD_BOX_STATUS) as [string, ...string[]];

export const createChildBoxSchema = z.object({
  product_id: z.string().uuid('Invalid product ID format'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive')
    .max(10000, 'Quantity must not exceed 10000')
    .optional()
    .default(1),
});

export const createBulkChildBoxSchema = z.object({
  product_id: z.string().uuid('Invalid product ID format'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive')
    .max(10000, 'Quantity must not exceed 10000')
    .optional()
    .default(1),
  count: z
    .number()
    .int('Count must be a whole number')
    .positive('Count must be at least 1')
    .max(500, 'Cannot create more than 500 child boxes at once'),
});

export const childBoxIdParamSchema = z.object({
  id: z.string().uuid('Invalid child box ID format'),
});

export const childBoxListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  status: z.enum(statusValues).optional(),
  product_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const createBulkMultiSizeChildBoxSchema = z.object({
  product_id: z.string().uuid('Invalid product ID format'),
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be positive')
    .max(10000, 'Quantity must not exceed 10000')
    .optional()
    .default(1),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1, 'Size is required'),
        count: z.number().int().positive('Count must be at least 1'),
      })
    )
    .min(1, 'At least one size must be specified')
    .max(50, 'Cannot specify more than 50 sizes'),
});

export type CreateChildBoxInput = z.infer<typeof createChildBoxSchema>;
export type CreateBulkChildBoxInput = z.infer<typeof createBulkChildBoxSchema>;
export type CreateBulkMultiSizeChildBoxInput = z.infer<typeof createBulkMultiSizeChildBoxSchema>;
