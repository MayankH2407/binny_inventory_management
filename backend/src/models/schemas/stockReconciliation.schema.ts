import { z } from 'zod';

export const openSessionSchema = z.object({
  scope: z
    .object({
      section: z.string().trim().min(1).optional(),
      category: z.string().trim().min(1).optional(),
      article_group: z.string().trim().min(1).optional(),
    })
    .optional()
    .default({}),
  notes: z.string().max(1000, 'Notes must not exceed 1000 characters').optional(),
});

export const scanItemSchema = z.object({
  client_scan_id: z.string().min(1).max(100),
  raw_payload: z.string().min(1, 'Scanned code is required').max(200).trim(),
  contents_mismatch: z.boolean().optional().default(false),
  is_manual: z.boolean().optional().default(false),
  scanned_at: z.string().datetime({ message: 'Invalid date format, expected ISO 8601' }).optional(),
});

export const submitScansSchema = z.object({
  scans: z
    .array(scanItemSchema)
    .min(1, 'At least one scan is required')
    .max(200, 'Cannot submit more than 200 scans at once'),
});

export const rejectSessionSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid('Invalid session ID format'),
});

export const sessionListQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 25),
  status: z.enum(['COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED']).optional(),
});

export const varianceQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export const scanHistoryQuerySchema = z.object({
  page: z.string().optional().transform((val) => val ? parseInt(val, 10) : 1),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 200),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type ScanItemInput = z.infer<typeof scanItemSchema>;
export type SubmitScansInput = z.infer<typeof submitScansSchema>;
export type RejectSessionInput = z.infer<typeof rejectSessionSchema>;
