/**
 * Channel configuration for the shared inventory drill-down UI.
 *
 * The same drill-down components (breadcrumb, summary cards, card grid, leaf
 * table) render three different stock views, differing only by:
 *   - which child boxes the backend counts (the `channel` query param)
 *   - the URL prefix used for drill-down links / breadcrumb
 *   - the root label shown in the breadcrumb
 *
 *   warehouse → main Inventory        (/inventory)
 *   sample    → Sample Stock          (/samples/inventory)
 *   ecommerce → E-commerce Stock       (/ecommerce/stock)
 */
export type InventoryChannel = 'warehouse' | 'sample' | 'ecommerce';

export interface ChannelConfig {
  channel: InventoryChannel;
  /** URL prefix for drill-down hrefs and the breadcrumb root. No trailing slash. */
  basePath: string;
  /** Label for the breadcrumb root crumb. */
  rootLabel: string;
}

export const CHANNEL_CONFIG: Record<InventoryChannel, ChannelConfig> = {
  warehouse: { channel: 'warehouse', basePath: '/inventory',        rootLabel: 'Inventory' },
  sample:    { channel: 'sample',    basePath: '/samples/inventory', rootLabel: 'Sample Stock' },
  ecommerce: { channel: 'ecommerce', basePath: '/ecommerce/stock',   rootLabel: 'E-commerce Stock' },
};

export const DEFAULT_CHANNEL_CONFIG = CHANNEL_CONFIG.warehouse;
