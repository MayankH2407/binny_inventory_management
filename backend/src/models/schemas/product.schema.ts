import { z } from 'zod';

const VALID_CATEGORIES = ['Gents', 'Ladies', 'Boys', 'Girls'] as const;
const VALID_LOCATIONS = ['VKIA', 'MIA', 'F540'] as const;

export const createProductSchema = z.object({
  article_name: z
    .string()
    .min(2, 'Article name must be at least 2 characters')
    .max(150, 'Article name must not exceed 150 characters')
    .trim(),
  article_code: z
    .string()
    .min(1, 'Article code is required')
    .max(20, 'Article code must not exceed 20 characters')
    .trim(),
  colour: z
    .string()
    .min(1, 'Colour is required')
    .max(50, 'Colour must not exceed 50 characters')
    .trim(),
  size: z
    .string()
    .min(1, 'Size is required')
    .max(10, 'Size must not exceed 10 characters')
    .trim(),
  mrp: z
    .number()
    .positive('MRP must be positive')
    .max(99999999.99, 'MRP must not exceed 99999999.99'),
  description: z
    .string()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .optional(),
  category: z.enum(VALID_CATEGORIES, { errorMap: () => ({ message: 'Category must be one of: Gents, Ladies, Boys, Girls' }) }),
  section: z.string().min(1, 'Section is required').max(100).trim(),
  location: z.enum(VALID_LOCATIONS, { errorMap: () => ({ message: 'Location must be one of: VKIA, MIA, F540' }) }).nullable().optional(),
  article_group: z.string().max(100, 'Article group must not exceed 100 characters').trim().nullable().optional(),
  hsn_code: z.string().max(20, 'HSN code must not exceed 20 characters').trim().nullable().optional(),
  size_from: z.string().max(10, 'Size from must not exceed 10 characters').trim().nullable().optional(),
  size_to: z.string().max(10, 'Size to must not exceed 10 characters').trim().nullable().optional(),
});

export const updateProductSchema = z.object({
  article_name: z.string().min(2).max(150).trim().optional(),
  sku: z.string().min(2).max(50).trim().toUpperCase().optional(),
  article_code: z.string().min(1).max(20).trim().optional(),
  colour: z.string().min(1).max(50).trim().optional(),
  size: z.string().min(1).max(10).trim().optional(),
  mrp: z.number().positive().max(99999999.99).optional(),
  description: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
  category: z.enum(VALID_CATEGORIES).nullable().optional(),
  section: z.string().min(1).max(100).trim().optional(),
  location: z.enum(VALID_LOCATIONS).nullable().optional(),
  article_group: z.string().max(100).trim().nullable().optional(),
  hsn_code: z.string().max(20).trim().nullable().optional(),
  size_from: z.string().max(10).trim().nullable().optional(),
  size_to: z.string().max(10).trim().nullable().optional(),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid('Invalid product ID format'),
});

export const productListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  article_code: z.string().optional(),
  search: z.string().optional(),
  is_active: z.string().optional().transform((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
  category: z.string().optional(),
  section: z.string().optional(),
  location: z.string().optional(),
  colour: z.string().optional(),
  size: z.string().optional(),
  article_name: z.string().optional(),
  article_group: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
