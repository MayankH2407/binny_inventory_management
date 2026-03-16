export interface CreateChildBoxRequest {
  product_id: string;
  quantity: number;
}

export interface CreateBulkChildBoxRequest {
  product_id: string;
  quantity: number;
  count: number;
}

export interface ChildBoxFilters {
  status?: string;
  product_id?: string;
  master_carton_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}
