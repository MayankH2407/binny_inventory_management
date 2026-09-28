import { ChildBoxStatus, MasterCartonStatus, TransactionType } from '../config/constants';

// Role names are dynamic (custom roles created via Role Manager), so `role`
// here is a plain string, not the fixed UserRole enum from constants.ts
// (that enum is only for the legacy authorize() RBAC guard's built-in roles).
export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role_id: string;
  role: string;
  is_active: boolean;
  last_login_at: Date | null;
  refresh_token: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserSafe {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Product {
  id: string;
  sku: string;
  article_name: string;
  article_code: string;
  colour: string;
  size: string;
  mrp: number;
  factory_price: number | null;
  description: string | null;
  category: string | null;
  section: string | null;
  location: string | null;
  article_group: string | null;
  hsn_code: string | null;
  size_from: string | null;
  size_to: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
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
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChildBox {
  id: string;
  barcode: string;
  product_id: string;
  status: ChildBoxStatus;
  quantity: number;
  // Set the first time each foot ships via a sample dispatch; independent of
  // any mapping row's is_active flag. Both NULL means "never foot-split".
  left_dispatched_at: Date | null;
  right_dispatched_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MasterCarton {
  id: string;
  carton_barcode: string;
  status: MasterCartonStatus;
  child_count: number;
  max_capacity: number;
  closed_at: Date | null;
  dispatched_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CartonChildMapping {
  id: string;
  master_carton_id: string;
  child_box_id: string;
  is_active: boolean;
  packed_at: Date;
  unpacked_at: Date | null;
  packed_by: string | null;
  unpacked_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface InventoryTransaction {
  id: string;
  transaction_type: TransactionType;
  child_box_id: string | null;
  master_carton_id: string | null;
  performed_by: string;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  created_at: Date;
}

export interface DispatchRecord {
  id: string;
  master_carton_id: string | null;
  sample_record_id: string | null;
  ecommerce_record_id: string | null;
  dispatched_by: string;
  customer_id: string | null;
  destination: string | null;
  transport_details: string | null;
  lr_number: string | null;
  vehicle_number: string | null;
  dispatch_date: Date;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  // Explicit source discriminator (see chk_dispatch_source) + e-commerce
  // pool-dispatch fields (see ecommerce-pool-redesign migration). Raw INSERT
  // ... RETURNING * rows carry the uppercase DB value ('MASTER_CARTON' etc);
  // getDispatchById/getDispatches lower() it for the API response — so this
  // is deliberately a plain string rather than a literal union.
  source_type: string;
  reference_name: string | null;
  marketplace: string | null;
  order_reference: string | null;
  listing_sku: string | null;
  order_date: Date | null;
  customer_firm_name?: string;
  source_label?: string;
  returned_box_count?: number;
  total_box_count?: number;
  return_status?: 'none' | 'partial' | 'full';
  created_at: Date;
  updated_at: Date;
}

export interface ReturnRecord {
  id: string;
  dispatch_record_id: string | null;
  customer_id: string | null;
  returned_by: string;
  return_date: Date;
  reason: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  customer_firm_name?: string;
  returned_by_name?: string;
  source_label?: string;
  item_count?: number;
  box_count?: number;
  pairs?: number;
  created_at: Date;
  updated_at: Date;
}

export interface ReturnItem {
  id: string;
  return_record_id: string;
  child_box_id: string | null;
  master_carton_id: string | null;
  dispatch_record_id: string | null;
  item_type: 'BOX' | 'CARTON';
  created_at: Date;
}

export interface StockReconciliationSession {
  id: string;
  session_code: string;
  status: string;
  scope: { section?: string; category?: string; article_group?: string };
  notes: string | null;
  snapshot_at: Date;
  recount_of_session_id: string | null;
  created_by: string;
  submitted_by: string | null;
  submitted_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  summary: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface StockReconciliationExpected {
  id: string;
  session_id: string;
  item_type: 'BOX' | 'LEGACY_CARTON';
  child_box_id: string | null;
  master_carton_id: string | null;
  product_id: string | null;
  status_at_snapshot: string;
  created_at: Date;
}

export interface StockReconciliationScan {
  id: string;
  session_id: string;
  client_scan_id: string;
  raw_payload: string;
  scan_type: 'BOX' | 'CARTON' | 'UNKNOWN';
  child_box_id: string | null;
  master_carton_id: string | null;
  result: 'OK' | 'DUPLICATE' | 'NOT_EXPECTED' | 'OUT_OF_SCOPE' | 'STATUS_CONFLICT' | 'UNKNOWN';
  contents_mismatch: boolean;
  is_manual: boolean;
  scanned_by: string;
  scanned_at: Date;
  created_at: Date;
}

export interface StockReconciliationAdjustment {
  id: string;
  session_id: string;
  child_box_id: string | null;
  master_carton_id: string | null;
  action: 'MARKED_MISSING' | 'RESTORED_FOUND' | 'SKIPPED_MOVED';
  old_status: string | null;
  new_status: string | null;
  old_master_carton_id: string | null;
  posted_by: string;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
