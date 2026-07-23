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

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  email?: string;
  name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

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

export type ChildBoxStatus = 'GENERATED' | 'FREE' | 'PACKED' | 'SAMPLE' | 'ECOMMERCE' | 'DISPATCHED';

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
  /** For channel views: whether this box is loose or reached via an allocated carton. */
  source?: 'loose' | 'carton';
  carton_barcode?: string | null;
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

export type SampleStatus = 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED';

export interface SampleRecord {
  id: string;
  sample_barcode: string;
  name: string;
  customer_id: string | null;
  recipient_name: string | null;
  purpose: string | null;
  sample_date: string | null;
  notes: string | null;
  status: SampleStatus;
  child_count: number;
  closed_at: string | null;
  dispatched_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  child_boxes?: ChildBoxWithProduct[];
  creator?: User;
  customer_firm_name?: string | null;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
}

export type EcommerceStatus = 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED';

export interface EcommerceRecord {
  id: string;
  ecommerce_barcode: string;
  name: string;
  marketplace: string | null;
  order_reference: string | null;
  listing_sku: string | null;
  mapped_date: string | null;
  notes: string | null;
  status: EcommerceStatus;
  child_count: number;
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

export type DispatchSourceType = 'master_carton' | 'sample' | 'ecommerce';

export type DispatchStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED';

export interface DispatchRecord {
  id: string;
  master_carton_id: string | null;
  sample_record_id?: string | null;
  ecommerce_record_id?: string | null;
  dispatched_by: string;
  customer_id: string | null;
  destination: string | null;
  transport_details: string | null;
  lr_number: string | null;
  vehicle_number: string | null;
  dispatch_date: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  source_type?: DispatchSourceType;
  source_label?: string | null;
  carton_barcode?: string;
  child_count?: number;
  customer_firm_name?: string;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
  // Return-status (computed server-side): how much of this dispatch has been returned.
  return_status?: 'none' | 'partial' | 'full';
  returned_box_count?: number;
  total_box_count?: number;
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
  // Exactly one of these three must be provided
  master_carton_ids?: string[];
  sample_record_id?: string;
  ecommerce_record_id?: string;
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

// ─── Carton-level membership (samples & e-commerce) ─────────────────────────
// A whole master carton allocated intact to a sample/e-commerce record.
// Shape mirrors backend getSampleCartons / getEcommerceCartons — verify field
// names against those services when wiring the service methods.
export interface CartonMembership {
  id: string;
  master_carton_id: string;
  carton_barcode: string;
  child_count: number;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
  mapped_at?: string | null;
}

// ─── Returns ────────────────────────────────────────────────────────────────
export interface ReturnItem {
  id: string;
  item_type: 'BOX' | 'CARTON';
  barcode: string;
  article_name?: string;
  colour?: string;
  size?: string;
  mrp?: number;
  carton_barcode?: string | null;
  dispatch_record_id?: string | null;
  origin_dispatch_label?: string | null;
}

export interface ReturnRecord {
  id: string;
  return_date: string;
  created_at: string;
  dispatch_record_id?: string | null;
  customer_id?: string | null;
  customer_firm_name?: string | null;
  returned_by_name?: string | null;
  source_label?: string | null;
  reason?: string | null;
  notes?: string | null;
  item_count?: number;
  box_count?: number;
  pairs?: number | null;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  items?: ReturnItem[];
}

// Blind-scan lookup result (GET /returns/lookup/:barcode).
export interface ReturnableItem {
  item_type: 'BOX' | 'CARTON';
  id: string;
  barcode: string;
  status: string;
  child_count?: number;
  returnable: boolean;
  reason?: string;
  channel?: string;
  article_name?: string;
  colour?: string;
  size?: string;
  mrp?: number;
  product_summary?: {
    article_summary?: string | null;
    colour_summary?: string | null;
    size_summary?: string | null;
    box_count?: number;
    pairs?: number;
    mrp?: number | null;
  };
  origin_dispatch?: {
    id: string;
    dispatch_date: string;
    customer_firm_name?: string | null;
    source_label?: string;
  } | null;
  // On GET /returns/dispatch/:id/items, items already returned are flagged:
  returned?: boolean;
  returned_at?: string | null;
}

export interface CreateReturnRequest {
  dispatch_record_id?: string;
  customer_id?: string;
  return_date?: string;
  reason?: string;
  notes?: string;
  items: Array<{ barcode: string; item_type: 'BOX' | 'CARTON' }>;
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
  key?: string;
  totalPairs?: number;
  inStock?: number;
  free: number;
  packed: number;
  sample?: number;
  ecommerce?: number;
  dispatched: number;
  generated?: number;
  total: number;
  childBoxCount?: number;
  cartonCount?: number;
  /** Number of children if drilled down. For 'article_name' level, equals distinctMrpCount when shown as MRP buckets. */
  children?: number;
  /** Set on 'article_name' level. If 1, MRP step is skipped (drill jumps article→colour). */
  distinctMrpCount?: number;
}

// ─── Report types ─────────────────────────────────────────────────────────────

export interface InventorySummaryResponse {
  totalProducts: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalChildBoxes: number;
  totalCartons: number;
  sections?: string[];
  articles?: string[];
}

export interface ProductWiseRow {
  sku: string;
  article_name: string;
  colour: string;
  size: string;
  total_boxes: number;
  free_boxes: number;
  packed_boxes: number;
  sample_boxes: number;
  ecommerce_boxes: number;
  dispatched_boxes: number;
  pairs_in_stock: number;
  pairs_dispatched: number;
}

export interface CartonRow {
  carton_barcode: string;
  status: string;
  child_count: number;
  created_at: string;
  closed_at: string | null;
  dispatched_at: string | null;
  destination: string | null;
}

export interface DispatchItemDetail {
  article_name: string;
  colour: string;
  sizes: string;
  mrp: number;
  carton_count: number;
  box_count: number;
}

export interface CustomerDispatchGroup {
  customer_id: string | null;
  customer_name: string;
  total_cartons: number;
  total_dispatches: number;
  dispatch_dates: string[];
  destinations: string[];
  items: DispatchItemDetail[];
}

export interface DispatchSummary {
  total_dispatches: number;
  total_cartons_dispatched: number;
  by_customer: CustomerDispatchGroup[];
}

export interface DailyActivityRow {
  date: string;
  boxes_created: number;
  boxes_packed: number;
  boxes_unpacked: number;
  boxes_dispatched: number;
  cartons_created: number;
  cartons_closed: number;
  cartons_dispatched: number;
}

// ─── Carton Hierarchy (Master Carton view) ─────────────────────────────────

export type CartonHierarchyLevel = 'status' | 'section' | 'article_name' | 'carton';

export interface CartonStockNode {
  name: string;
  key: string;
  cartonCount: number;
  createdCount?: number;
  activeCount?: number;
  closedCount?: number;
  dispatchedCount?: number;
  childBoxCount: number;
  totalPairs: number;
  avgUtilization?: number;
  // Carton-leaf-only fields:
  id?: string;
  carton_barcode?: string;
  status?: 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED';
  child_count?: number;
  max_capacity?: number;
  primary_section?: string;
  primary_article?: string;
  created_at?: string;
  closed_at?: string | null;
  dispatched_at?: string | null;
}
