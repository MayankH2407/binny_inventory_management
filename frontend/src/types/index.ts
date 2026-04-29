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
  child_boxes?: ChildBoxWithProduct[];
  creator?: User;
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
  created_at: string;
  updated_at: string;
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
  errors?: Record<string, string[]>;
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

// ---------- Assortment ----------
export interface AssortmentItem {
  article_name: string;
  colour: string;
  size: string;
  mrp: number;
  count: number;
}
