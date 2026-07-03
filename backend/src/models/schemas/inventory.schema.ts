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

// ─── Inventory Breakdown (7-level drill-down) ───────────────────────────────

const BREAKDOWN_LEVELS = ['section', 'category', 'group', 'article', 'colour', 'size_group', 'leaf'] as const;
export type BreakdownLevel = (typeof BREAKDOWN_LEVELS)[number];

/**
 * path[] fields that must be present for each level:
 *   section     → none
 *   category    → section
 *   group       → section, category
 *   article     → section, category, group
 *   colour      → section, category, group, article
 *   size_group  → section, category, group, article, colour
 *   leaf        → section, category, group, article, colour, size_group
 */
const PATH_REQUIREMENTS: Record<BreakdownLevel, (keyof BreakdownPath)[]> = {
  section:    [],
  category:   ['section'],
  group:      ['section', 'category'],
  article:    ['section', 'category', 'group'],
  colour:     ['section', 'category', 'group', 'article'],
  size_group: ['section', 'category', 'group', 'article', 'colour'],
  leaf:       ['section', 'category', 'group', 'article', 'colour', 'size_group'],
};

const breakdownPathSchema = z.object({
  section:    z.string().optional(),
  category:   z.string().optional(),
  group:      z.string().optional(),
  article:    z.string().optional(),
  colour:     z.string().optional(),
  size_group: z.string().optional(),
});

export type BreakdownPath = z.infer<typeof breakdownPathSchema>;

/**
 * channel scopes which child boxes are counted:
 *   warehouse  → in-stock boxes (PACKED-in-carton + FREE loose) — the default
 *   sample     → boxes currently allocated to samples (status = SAMPLE)
 *   ecommerce  → boxes currently allocated to e-commerce (status = ECOMMERCE)
 */
export const BREAKDOWN_CHANNELS = ['warehouse', 'sample', 'ecommerce'] as const;
export type BreakdownChannel = (typeof BREAKDOWN_CHANNELS)[number];

export const inventoryBreakdownQuerySchema = z.object({
  level:   z.enum(BREAKDOWN_LEVELS),
  channel: z.enum(BREAKDOWN_CHANNELS).optional().default('warehouse'),
  path:    breakdownPathSchema.optional().default({}),
}).refine(
  (data) => {
    const required = PATH_REQUIREMENTS[data.level];
    const path = data.path ?? {};
    return required.every(key => path[key] !== undefined && path[key] !== '');
  },
  (data) => {
    const required = PATH_REQUIREMENTS[data.level];
    const path = data.path ?? {};
    const missing = required.filter(k => !path[k]);
    return {
      message: `level="${data.level}" requires path fields: ${missing.join(', ')}`,
      path: ['path'],
    };
  }
);

export type InventoryBreakdownInput = z.infer<typeof inventoryBreakdownQuerySchema>;
