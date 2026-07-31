export interface UserPermission {
  permission: string;
  max_stage: string | null;
}

// Role names are dynamic (custom roles created via Role Manager), so `role`
// is a plain string, not a fixed union of the built-in role names.
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permissions?: UserPermission[];
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

// ---------- Product ----------
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

// ---------- ProductSection ----------
export interface ProductSection {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ---------- ChildBox ----------
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

/** ChildBox with joined product fields (returned by list / detail endpoints) */
export interface ChildBoxWithProduct extends ChildBox {
  article_name: string;
  article_code: string;
  colour: string;
  size: string;
  mrp: number;
  sku: string;
  // Feet of this box currently held by active sample mappings (e.g. ['LEFT']). Present on barcode lookups.
  active_sample_feet?: ('LEFT' | 'RIGHT' | 'PAIR')[];
  // On sample/ecommerce children endpoints: whether this box was added individually
  // ('loose') or arrived as part of a whole scanned master carton ('carton').
  source?: 'loose' | 'carton';
  // Present when source === 'carton' — the barcode of the carton it came in via.
  carton_barcode?: string;
}

// ---------- MasterCarton ----------
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
  is_legacy?: boolean;
  section?: string | null;
  category?: string | null;
  article_group?: string | null;
  size_group?: string | null;
  legacy_colour?: string | null;
  legacy_mrp?: string | null;
  legacy_pairs?: number | null;
}

// ---------- Carton membership (whole master carton scanned intact into a sample/e-commerce record) ----------
export interface CartonMembership {
  mapping_id: string;
  master_carton_id: string;
  carton_barcode: string;
  status: MasterCartonStatus;
  child_count: number;
  article_summary: string | null;
  colour_summary: string | null;
  size_summary: string | null;
  mrp_summary: number | null;
  // How many of this carton's boxes have been individually taken out into this
  // sample as loose items (see sample.service.ts takeBoxOutOfCartonAllocation).
  taken_out_count?: number;
}

// ---------- Sample child-box row (GET /samples/:id/children) ----------
// Deliberately NOT ChildBoxWithProduct: that type's `id` means "the child box's
// own id" everywhere else, but this endpoint's `id` is actually the MAPPING id
// (sample_box_mapping.id for loose rows, carton_child_mapping.id for
// carton-sourced rows) — reusing ChildBoxWithProduct here is exactly the type
// mismatch that caused the original "remove box" bug (mapping id sent where a
// child box id was expected). child_box_id is the real box id.
export interface SampleChildBoxRow {
  id: string; // mapping id — use this for take-out/remove/set-foot calls
  child_box_id: string;
  sample_record_id: string;
  is_active: boolean;
  barcode: string;
  status: ChildBoxStatus;
  quantity: number;
  article_name: string;
  article_code: string;
  sku: string;
  size: string;
  colour: string;
  mrp: number;
  foot: 'LEFT' | 'RIGHT' | 'PAIR';
  source: 'loose' | 'carton';
  carton_barcode: string | null;
  // Present only when source === 'carton' — the carton this row came from.
  master_carton_id: string | null;
  // Present only when source === 'loose' AND this box was taken out of a
  // carton allocation individually — which carton it originally came from.
  source_master_carton_id: string | null;
}

// ---------- SampleRecord ----------
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
  child_boxes?: SampleChildBoxRow[];
  creator?: User;
  creator_name?: string | null;
  customer?: Customer | null;
  customer_firm_name?: string | null;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
}

// ---------- EcommerceRecord ----------
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

// ---------- Dispatch ----------
export type DispatchStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED';

export interface Dispatch {
  id: string;
  dispatch_number: string;
  status: DispatchStatus;
  destination: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  notes: string;
  master_cartons: MasterCarton[];
  total_cartons: number;
  dispatched_by: string;
  dispatcher?: User;
  dispatched_at: string;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DispatchSourceType = 'master_carton' | 'sample' | 'ecommerce';

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
  // Virtual columns from backend
  source_type?: DispatchSourceType;
  source_label?: string | null;
  // Legacy / joined columns
  carton_barcode?: string;
  child_count?: number;
  customer_firm_name?: string;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
  // Return-status roll-up (backend-computed)
  return_status?: 'none' | 'partial' | 'full';
  returned_box_count?: number;
  total_box_count?: number;
  created_at: string;
  updated_at: string;
}

// ---------- Returns ----------
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
  source_type?: string | null;
  dispatch_date?: string | null;
  notes?: string | null;
  reason?: string | null;
  item_count?: number;
  box_count?: number;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  pairs?: number | null;
  items?: ReturnItem[];
}

export interface ReturnableItem {
  item_type: 'BOX' | 'CARTON';
  id: string;
  barcode: string;
  status: string;
  child_count?: number;
  returnable: boolean;
  reason?: string;
  returned?: boolean;
  returned_at?: string | null;
  channel?: string;
  article_name?: string;
  colour?: string;
  size?: string;
  mrp?: number;
  product_summary?: {
    article_summary?: string;
    colour_summary?: string;
    size_summary?: string;
    box_count?: number;
    pairs?: number;
    mrp?: number;
  };
  origin_dispatch?: {
    id: string;
    dispatch_date: string;
    customer_firm_name?: string;
    source_label?: string;
  } | null;
}

export interface CreateReturnRequest {
  dispatch_record_id?: string;
  customer_id?: string;
  return_date?: string;
  notes?: string;
  reason?: string;
  items: Array<{ barcode: string; item_type: 'BOX' | 'CARTON' }>;
}

// ---------- Report types ----------
export interface SampleReportRow {
  id: string;
  sample_barcode: string;
  name: string;
  recipient: string | null;
  status: string;
  child_count: number;
  sample_date: string | null;
  created_at: string;
  dispatched_at: string | null;
}

export interface SampleReportSummary {
  total: number;
  by_status: Record<string, number>;
  total_pairs: number;
}

export interface SampleReportResponse {
  summary: SampleReportSummary;
  rows: SampleReportRow[];
}

export interface EcommerceReportRow {
  id: string;
  ecommerce_barcode: string;
  name: string;
  marketplace: string | null;
  order_reference: string | null;
  listing_sku: string | null;
  status: string;
  child_count: number;
  mapped_date: string | null;
  created_at: string;
  dispatched_at: string | null;
}

export interface EcommerceReportSummary {
  total: number;
  by_status: Record<string, number>;
  total_pairs: number;
  by_marketplace: Array<{ marketplace: string; count: number }>;
}

export interface EcommerceReportResponse {
  summary: EcommerceReportSummary;
  rows: EcommerceReportRow[];
}

// ---------- Customer ----------
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

export interface UpdateCustomerRequest extends Partial<CreateCustomerRequest> {
  is_active?: boolean;
}

// ---------- Traceability ----------
export interface TraceabilityResult {
  childBox: ChildBoxWithProduct;
  masterCarton: MasterCarton | null;
  dispatch: Dispatch | null;
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

// ---------- Dashboard ----------
export interface DashboardStats {
  totalChildBoxes: number;
  generatedBoxes: number;
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

// ---------- API generics ----------
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PaginatedApiResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: string[];
}

// ---------- Request types ----------
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
  // Exactly one of these must be provided
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
  // Ship only some of a sample's contents — everything else in the sample is
  // released back to available stock. Only valid with sample_record_id.
  sample_scope?: {
    child_box_ids: string[];
    release_remainder: true;
  };
}

export interface UnpackRequest {
  master_carton_id: string;
  child_box_barcodes: string[];
}

export type ScanSessionType = 'pack' | 'unpack' | 'dispatch' | 'trace';

export interface ScanSession {
  type: ScanSessionType;
  scannedItems: string[];
  startedAt: string;
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  sku?: string;
}

// ---------- Carton Hierarchy (Master Carton view) ----------
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
  // For carton leaf only:
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

// ---------- Assortment ----------
export interface AssortmentItem {
  article_name: string;
  colour: string;
  size: string;
  mrp: number;
  count: number;
}
