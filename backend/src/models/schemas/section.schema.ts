import { z } from 'zod';

export const createSectionSchema = z.object({
  name: z
    .string()
    .min(1, 'Section name is required')
    .max(100, 'Section name must not exceed 100 characters')
    .trim(),
  display_order: z.number().int().min(0).optional(),
});

export const updateSectionSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
});

export const sectionIdParamSchema = z.object({
  id: z.string().uuid('Invalid section ID format'),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
