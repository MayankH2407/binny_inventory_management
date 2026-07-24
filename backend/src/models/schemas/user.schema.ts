import { z } from 'zod';

// Role is validated against the `roles` table at the service layer (dynamic,
// supports custom roles created via Role Manager) — not a fixed enum here.
const roleNameSchema = z
  .string()
  .trim()
  .min(1, 'Role is required')
  .max(100, 'Role name must not exceed 100 characters');

export const createUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim(),
  role: roleNameSchema,
});

export const updateUserSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255)
    .trim()
    .toLowerCase()
    .optional(),
  name: z
    .string()
    .min(2)
    .max(100)
    .trim()
    .optional(),
  role: roleNameSchema.optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .optional(),
  is_active: z.boolean().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

export const userListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  role: z.string().optional(),
  search: z.string().optional(),
  is_active: z.string().optional().transform((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
