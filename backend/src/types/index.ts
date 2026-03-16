import { ChildBoxStatus, MasterCartonStatus, TransactionType, UserRole } from '../config/constants';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role_id: string;
  role: UserRole;
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
  role: UserRole;
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
  description: string | null;
  category: string | null;
  section: string | null;
  location: string | null;
  article_group: string | null;
  hsn_code: string | null;
  size_group: string | null;
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
  master_carton_id: string;
  dispatched_by: string;
  customer_id: string | null;
  destination: string | null;
  transport_details: string | null;
  lr_number: string | null;
  vehicle_number: string | null;
  dispatch_date: Date;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  customer_firm_name?: string;
  created_at: Date;
  updated_at: Date;
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
