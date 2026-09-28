export const CHILD_BOX_STATUS = {
  GENERATED: 'GENERATED',
  FREE: 'FREE',
  PACKED: 'PACKED',
  SAMPLE: 'SAMPLE',
  ECOMMERCE: 'ECOMMERCE',
  // One shoe of this box has shipped as a sample; the other shoe is
  // physically on hand and available for further sample allocation only
  // (not packing, not e-commerce, not counted as a pair anywhere). See
  // migration 20260901100003/20260901100004 and left_dispatched_at /
  // right_dispatched_at on child_boxes.
  PARTIAL: 'PARTIAL',
  DISPATCHED: 'DISPATCHED',
  // Expected by a posted stock reconciliation session but never scanned.
  // Reversible: scanning it in a later session restores it to FREE. See
  // stockReconciliation.service.ts.
  MISSING: 'MISSING',
} as const;

export const MASTER_CARTON_STATUS = {
  CREATED: 'CREATED',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  DISPATCHED: 'DISPATCHED',
  // See CHILD_BOX_STATUS.MISSING — also used for a legacy carton (which has
  // no child boxes of its own) marked missing by a posted reconciliation.
  MISSING: 'MISSING',
} as const;

// NOTE: sample_records no longer has a stored `status` column (Samples pool
// redesign, migration 20260901100002) — a record's state is derived at read
// time from its live/shipped mapping rows (EMPTY/OPEN/DISPATCHED), since a
// stored status can't be honestly maintained once a record can be partially
// dispatched. SAMPLE_STATUS is intentionally removed; see SampleState in
// sample.service.ts for the derived equivalent.

export const ECOMMERCE_STATUS = {
  CREATED: 'CREATED',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  DISPATCHED: 'DISPATCHED',
} as const;

export const TRANSACTION_TYPES = {
  CHILD_CREATED: 'CHILD_CREATED',
  CHILD_PACKED: 'CHILD_PACKED',
  CHILD_UNPACKED: 'CHILD_UNPACKED',
  CHILD_REPACKED: 'CHILD_REPACKED',
  CHILD_SAMPLED: 'CHILD_SAMPLED',
  CHILD_UNSAMPLED: 'CHILD_UNSAMPLED',
  CHILD_ECOMMERCED: 'CHILD_ECOMMERCED',
  CHILD_UNECOMMERCED: 'CHILD_UNECOMMERCED',
  CARTON_CREATED: 'CARTON_CREATED',
  CARTON_CLOSED: 'CARTON_CLOSED',
  CARTON_REOPENED: 'CARTON_REOPENED',
  CARTON_DISPATCHED: 'CARTON_DISPATCHED',
  SAMPLE_CREATED: 'SAMPLE_CREATED',
  SAMPLE_CLOSED: 'SAMPLE_CLOSED',
  SAMPLE_REOPENED: 'SAMPLE_REOPENED',
  SAMPLE_DISPATCHED: 'SAMPLE_DISPATCHED',
  ECOMMERCE_CREATED: 'ECOMMERCE_CREATED',
  ECOMMERCE_CLOSED: 'ECOMMERCE_CLOSED',
  ECOMMERCE_REOPENED: 'ECOMMERCE_REOPENED',
  ECOMMERCE_DISPATCHED: 'ECOMMERCE_DISPATCHED',
  CHILD_DISPATCHED: 'CHILD_DISPATCHED',
  CHILD_LABEL_REPRINTED: 'CHILD_LABEL_REPRINTED',
  CHILD_ACTIVATED: 'CHILD_ACTIVATED',
  LEGACY_CARTON_OPENED: 'LEGACY_CARTON_OPENED',
  CARTON_SAMPLED: 'CARTON_SAMPLED',
  CARTON_ECOMMERCED: 'CARTON_ECOMMERCED',
  CHILD_RETURNED: 'CHILD_RETURNED',
  CARTON_RETURNED: 'CARTON_RETURNED',
  CARTON_UNSAMPLED: 'CARTON_UNSAMPLED',
  CARTON_UNECOMMERCED: 'CARTON_UNECOMMERCED',
  CARTON_UNPACKED_TO_ECOM_POOL: 'CARTON_UNPACKED_TO_ECOM_POOL',
  CARTON_UNPACKED_TO_SAMPLE: 'CARTON_UNPACKED_TO_SAMPLE',
  STOCK_RECON_MISSING: 'STOCK_RECON_MISSING',
  STOCK_RECON_FOUND: 'STOCK_RECON_FOUND',
} as const;

export const RETURN_ITEM_TYPE = {
  BOX: 'BOX',
  CARTON: 'CARTON',
} as const;

export const STOCK_RECON_STATUS = {
  COUNTING: 'COUNTING',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;

export const STOCK_RECON_ITEM_TYPE = {
  BOX: 'BOX',
  LEGACY_CARTON: 'LEGACY_CARTON',
} as const;

export const STOCK_RECON_SCAN_TYPE = {
  BOX: 'BOX',
  CARTON: 'CARTON',
  UNKNOWN: 'UNKNOWN',
} as const;

export const STOCK_RECON_SCAN_RESULT = {
  OK: 'OK',
  DUPLICATE: 'DUPLICATE',
  NOT_EXPECTED: 'NOT_EXPECTED',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  STATUS_CONFLICT: 'STATUS_CONFLICT',
  UNKNOWN: 'UNKNOWN',
} as const;

export const STOCK_RECON_ADJUSTMENT_ACTION = {
  MARKED_MISSING: 'MARKED_MISSING',
  RESTORED_FOUND: 'RESTORED_FOUND',
  SKIPPED_MOVED: 'SKIPPED_MOVED',
} as const;

export const USER_ROLES = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Supervisor',
  WAREHOUSE_OPERATOR: 'Warehouse Operator',
  DISPATCH_OPERATOR: 'Dispatch Operator',
} as const;

export const PRODUCT_CATEGORIES = {
  GENTS: 'Gents',
  LADIES: 'Ladies',
  BOYS: 'Boys',
  GIRLS: 'Girls',
} as const;

export const PRODUCT_SECTIONS = {
  HAWAII: 'Hawaii',
  PU: 'PU',
  EVA: 'EVA',
  FABRICATION: 'Fabrication',
  CANVAS: 'Canvas',
  PVC: 'PVC',
  SPORTS_SHOES: 'Sports Shoes',
} as const;

export const PRODUCT_LOCATIONS = {
  VKIA: 'VKIA',
  MIA: 'MIA',
  F540: 'F540',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;

export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 50000,
  AUTH_WINDOW_MS: 15 * 60 * 1000,
  AUTH_MAX_REQUESTS: 50000,
} as const;

export const CUSTOMER_TYPES = {
  PRIMARY_DEALER: 'Primary Dealer',
  SUB_DEALER: 'Sub Dealer',
} as const;

export type ChildBoxStatus = typeof CHILD_BOX_STATUS[keyof typeof CHILD_BOX_STATUS];
export type MasterCartonStatus = typeof MASTER_CARTON_STATUS[keyof typeof MASTER_CARTON_STATUS];
export type EcommerceStatus = typeof ECOMMERCE_STATUS[keyof typeof ECOMMERCE_STATUS];
export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export type ProductCategory = typeof PRODUCT_CATEGORIES[keyof typeof PRODUCT_CATEGORIES];
export type ProductSection = typeof PRODUCT_SECTIONS[keyof typeof PRODUCT_SECTIONS];
export type ProductLocation = typeof PRODUCT_LOCATIONS[keyof typeof PRODUCT_LOCATIONS];
export type CustomerType = typeof CUSTOMER_TYPES[keyof typeof CUSTOMER_TYPES];
export type ReturnItemType = typeof RETURN_ITEM_TYPE[keyof typeof RETURN_ITEM_TYPE];
export type StockReconStatus = typeof STOCK_RECON_STATUS[keyof typeof STOCK_RECON_STATUS];
export type StockReconItemType = typeof STOCK_RECON_ITEM_TYPE[keyof typeof STOCK_RECON_ITEM_TYPE];
export type StockReconScanType = typeof STOCK_RECON_SCAN_TYPE[keyof typeof STOCK_RECON_SCAN_TYPE];
export type StockReconScanResult = typeof STOCK_RECON_SCAN_RESULT[keyof typeof STOCK_RECON_SCAN_RESULT];
export type StockReconAdjustmentAction = typeof STOCK_RECON_ADJUSTMENT_ACTION[keyof typeof STOCK_RECON_ADJUSTMENT_ACTION];
