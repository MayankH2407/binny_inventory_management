export const CHILD_BOX_STATUS = {
  FREE: 'FREE',
  PACKED: 'PACKED',
  DISPATCHED: 'DISPATCHED',
} as const;

export const MASTER_CARTON_STATUS = {
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
  CARTON_CREATED: 'CARTON_CREATED',
  CARTON_CLOSED: 'CARTON_CLOSED',
  CARTON_REOPENED: 'CARTON_REOPENED',
  CARTON_DISPATCHED: 'CARTON_DISPATCHED',
  CHILD_DISPATCHED: 'CHILD_DISPATCHED',
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

export type ChildBoxStatus = typeof CHILD_BOX_STATUS[keyof typeof CHILD_BOX_STATUS];
export type MasterCartonStatus = typeof MASTER_CARTON_STATUS[keyof typeof MASTER_CARTON_STATUS];
export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];
export type ProductCategory = typeof PRODUCT_CATEGORIES[keyof typeof PRODUCT_CATEGORIES];
export type ProductSection = typeof PRODUCT_SECTIONS[keyof typeof PRODUCT_SECTIONS];
export type ProductLocation = typeof PRODUCT_LOCATIONS[keyof typeof PRODUCT_LOCATIONS];
