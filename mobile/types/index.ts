export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'Admin' | 'Supervisor' | 'Warehouse Operator' | 'Dispatch Operator';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Product {
  id: string;
  sku: string;
  article_name: string;
  article_code: string;
  colour: string;
  size: string;
  mrp: number;
  description: string | null;
  category: string | null;
  section: string | null;
  location: string | null;
  article_group: string | null;
  hsn_code: string | null;
  size_from: string | null;
  size_to: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductSection {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type ChildBoxStatus = 'FREE' | 'PACKED' | 'DISPATCHED';

export interface ChildBox {
  id: string;
  barcode: string;
  product_id: string;
  status: ChildBoxStatus;
  quantity: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChildBoxWithProduct extends ChildBox {
  article_name: string;
  article_code: string;
  colour: string;
  size: string;
  mrp: number;
  sku: string;
}

export type MasterCartonStatus = 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED';

export interface MasterCarton {
  id: string;
  carton_barcode: string;
  status: MasterCartonStatus;
  child_count: number;
  max_capacity: number;
  closed_at: string | null;
  dispatched_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  child_boxes?: ChildBoxWithProduct[];
  creator?: User;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
}

export type DispatchStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED';

export interface DispatchRecord {
  id: string;
  master_carton_id: string;
  dispatched_by: string;
  customer_id: string | null;
  destination: string | null;
  transport_details: string | null;
  lr_number: string | null;
  vehicle_number: string | null;
  dispatch_date: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  carton_barcode?: string;
  child_count?: number;
  customer_firm_name?: string;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  firm_name: string;
  address: string | null;
  delivery_location: string | null;
  gstin: string | null;
  private_marka: string | null;
  gr: string | null;
  contact_person_name: string | null;
  contact_person_mobile: string | null;
  customer_type: 'Primary Dealer' | 'Sub Dealer';
  primary_dealer_id: string | null;
  primary_dealer_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerRequest {
  firm_name: string;
  address?: string | null;
  delivery_location?: string | null;
  gstin?: string | null;
  private_marka?: string | null;
  gr?: string | null;
  contact_person_name?: string | null;
  contact_person_mobile?: string | null;
  customer_type?: 'Primary Dealer' | 'Sub Dealer';
  primary_dealer_id?: string | null;
}

export interface TraceabilityResult {
  childBox: ChildBoxWithProduct;
  masterCarton: MasterCarton | null;
  dispatch: DispatchRecord | null;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  id: string;
  action: string;
  description: string;
  performed_by: string;
  performed_at: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardStats {
  totalChildBoxes: number;
  freeChildBoxes: number;
  packedChildBoxes: number;
  dispatchedChildBoxes: number;
  totalMasterCartons: number;
  createdCartons: number;
  activeCartons: number;
  closedCartons: number;
  dispatchedCartons: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalProducts: number;
  todayDispatches: number;
  totalDispatches: number;
  activeMasterCartons: number;
  closedMasterCartons: number;
  recentTransactions: Array<{
    id: string;
    transaction_type: string;
    child_box_id: string | null;
    master_carton_id: string | null;
    performed_by: string;
    notes: string | null;
    created_at: string;
  }>;
}

export interface BulkCreateChildBoxRequest {
  product_id: string;
  count: number;
  quantity?: number;
}

export interface BulkCreateMultiSizeRequest {
  product_id: string;
  quantity?: number;
  sizes: Array<{ size: string; count: number }>;
}

export interface CreateMasterCartonRequest {
  max_capacity: number;
  child_box_barcodes: string[];
}

export interface CreateDispatchRequest {
  master_carton_ids: string[];
  customer_id?: string;
  destination?: string;
  transport_details?: string;
  lr_number?: string;
  vehicle_number?: string;
  dispatch_date?: string;
  notes?: string;
}

export interface AssortmentItem {
  article_name: string;
  colour: string;
  size: string;
  mrp: number;
  count: number;
}

export interface InventoryStockSummary {
  totalProducts: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalChildBoxes: number;
  totalCartons: number;
  sections: string[];
  articles: string[];
}

export interface InventoryHierarchyItem {
  name: string;
  free: number;
  packed: number;
  dispatched: number;
  total: number;
}
