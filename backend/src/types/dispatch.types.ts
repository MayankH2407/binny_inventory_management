export interface CreateDispatchRequest {
  master_carton_ids: string[];
  destination: string;
  transporter?: string;
  vehicle_number?: string;
  dispatch_date?: string;
  notes?: string;
}

export interface DispatchFilters {
  destination?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}
