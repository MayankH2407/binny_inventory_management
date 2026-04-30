import { z } from 'zod';

export const cartonHierarchyQuerySchema = z.object({
  level: z.enum(['status', 'section', 'article_name', 'carton']),
  status: z.enum(['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']).optional(),
  section: z.string().optional(),
  article_name: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().transform(v => v ? parseInt(v, 10) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v, 10) : 50),
});

export type CartonHierarchyQuery = z.infer<typeof cartonHierarchyQuerySchema>;
