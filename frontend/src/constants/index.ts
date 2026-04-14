export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  CHILD_BOXES: '/child-boxes',
  CHILD_BOXES_GENERATE: '/child-boxes/generate',
  MASTER_CARTONS: '/master-cartons',
  MASTER_CARTONS_CREATE: '/master-cartons/create',
  MASTER_CARTON_DETAIL: (id: string) => `/master-cartons/${id}`,
  SCAN: '/scan',
  UNPACK: '/unpack',
  DISPATCH: '/dispatch',
  DISPATCHES: '/dispatches',
  REPACK: '/repack',
  STORAGE: '/storage',
  REPORTS: '/reports',
  TRACEABILITY: '/traceability',
  PRODUCTS: '/products',
  CUSTOMERS: '/customers',
  USERS: '/users',
  INVENTORY: '/inventory',
  SETTINGS: '/settings',
} as const;

export const STATUS_LABELS: Record<string, string> = {
  FREE: 'Free',
  PACKED: 'Packed',
  DISPATCHED: 'Dispatched',
  CREATED: 'Created',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  FREE: { bg: 'bg-green-100', text: 'text-green-700' },
  PACKED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  DISPATCHED: { bg: 'bg-gray-100', text: 'text-gray-700' },
  CREATED: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  ACTIVE: { bg: 'bg-green-100', text: 'text-green-700' },
  CLOSED: { bg: 'bg-orange-100', text: 'text-orange-700' },
  IN_TRANSIT: { bg: 'bg-blue-100', text: 'text-blue-700' },
  DELIVERED: { bg: 'bg-green-100', text: 'text-green-700' },
};

export const ROLE_LABELS: Record<string, string> = {
  Admin: 'Admin',
  Supervisor: 'Supervisor',
  'Warehouse Operator': 'Warehouse Operator',
  'Dispatch Operator': 'Dispatch Operator',
};

export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  Admin: { bg: 'bg-red-100', text: 'text-red-700' },
  Supervisor: { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Warehouse Operator': { bg: 'bg-gray-100', text: 'text-gray-700' },
  'Dispatch Operator': { bg: 'bg-orange-100', text: 'text-orange-700' },
};

export const NAV_ITEMS = [
  { label: 'Dashboard', href: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { label: 'Child Boxes', href: ROUTES.CHILD_BOXES, icon: 'Package' },
  { label: 'Master Cartons', href: ROUTES.MASTER_CARTONS, icon: 'Boxes' },
  { label: 'Scan & Trace', href: ROUTES.SCAN, icon: 'ScanLine' },
  { label: 'Unpack', href: ROUTES.UNPACK, icon: 'PackageOpen' },
  { label: 'Repack', href: ROUTES.REPACK, icon: 'ArrowLeftRight' },
  { label: 'Dispatch', href: ROUTES.DISPATCH, icon: 'Truck' },
  { label: 'Dispatches', href: ROUTES.DISPATCHES, icon: 'ClipboardList' },
  { label: 'Inventory', href: ROUTES.INVENTORY, icon: 'Warehouse' },
  { label: 'Reports', href: ROUTES.REPORTS, icon: 'BarChart3' },
  { label: 'Products', href: ROUTES.PRODUCTS, icon: 'Tag', adminOnly: true },
  { label: 'Customers', href: ROUTES.CUSTOMERS, icon: 'Building2', adminOnly: true },
  { label: 'Users', href: ROUTES.USERS, icon: 'Users', adminOnly: true },
  { label: 'Settings', href: ROUTES.SETTINGS, icon: 'Settings' },
] as const;

export const MOBILE_NAV_ITEMS = [
  { label: 'Home', href: ROUTES.DASHBOARD, icon: 'Home' },
  { label: 'Scan & Trace', href: ROUTES.SCAN, icon: 'ScanLine' },
  { label: 'Create', href: ROUTES.MASTER_CARTONS_CREATE, icon: 'PlusCircle' },
  { label: 'Dispatch', href: ROUTES.DISPATCH, icon: 'Truck' },
] as const;

export const PAGE_SIZE = 20;

export const PRODUCT_CATEGORIES = ['Gents', 'Ladies', 'Boys', 'Girls'] as const;
export const PRODUCT_SECTIONS = ['Hawaii', 'PU', 'EVA', 'Fabrication', 'Canvas', 'PVC', 'Sports Shoes'] as const;
export const PRODUCT_LOCATIONS = ['VKIA', 'MIA', 'F540'] as const;

export const CUSTOMER_TYPES = ['Primary Dealer', 'Sub Dealer'] as const;
