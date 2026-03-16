import { z } from 'zod';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const MOBILE_REGEX = /^[0-9]{10,15}$/;

export const createCustomerSchema = z.object({
  firm_name: z
    .string()
    .min(1, 'Firm name is required')
    .max(255, 'Firm name must not exceed 255 characters')
    .trim(),
  address: z.string().max(2000, 'Address must not exceed 2000 characters').trim().nullable().optional(),
  delivery_location: z.string().max(255, 'Delivery location must not exceed 255 characters').trim().nullable().optional(),
  gstin: z
    .string()
    .regex(GSTIN_REGEX, 'Invalid GSTIN format (expected 15-char Indian GST format, e.g., 22AAAAA0000A1Z5)')
    .nullable()
    .optional(),
  private_marka: z.string().max(255, 'Private marka must not exceed 255 characters').trim().nullable().optional(),
  gr: z.string().max(100, 'GR must not exceed 100 characters').trim().nullable().optional(),
  contact_person_name: z.string().max(150, 'Contact person name must not exceed 150 characters').trim().nullable().optional(),
  contact_person_mobile: z
    .string()
    .regex(MOBILE_REGEX, 'Contact mobile must be 10-15 digits')
    .nullable()
    .optional(),
});

export const updateCustomerSchema = z.object({
  firm_name: z.string().min(1).max(255).trim().optional(),
  address: z.string().max(2000).trim().nullable().optional(),
  delivery_location: z.string().max(255).trim().nullable().optional(),
  gstin: z.string().regex(GSTIN_REGEX, 'Invalid GSTIN format').nullable().optional(),
  private_marka: z.string().max(255).trim().nullable().optional(),
  gr: z.string().max(100).trim().nullable().optional(),
  contact_person_name: z.string().max(150).trim().nullable().optional(),
  contact_person_mobile: z.string().regex(MOBILE_REGEX, 'Contact mobile must be 10-15 digits').nullable().optional(),
  is_active: z.boolean().optional(),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid('Invalid customer ID format'),
});

export const customerListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  search: z.string().optional(),
  is_active: z.string().optional().transform((val) => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
