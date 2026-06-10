import { z } from 'zod';

export const permissionEntrySchema = z.object({
  permission: z
    .string()
    .min(1)
    .regex(/^[a-z_]+:[a-z_]+$/, 'Permission must be in format module:action (e.g. cartons:update)'),
  max_stage: z
    .string()
    .max(50)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters')
    .trim(),
  permissions: z.array(permissionEntrySchema).default([]),
});

export const updateRoleSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .trim()
    .optional(),
  permissions: z.array(permissionEntrySchema).optional(),
});

export const roleIdParamSchema = z.object({
  id: z.string().uuid('Invalid role ID format'),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type PermissionEntry = z.infer<typeof permissionEntrySchema>;
