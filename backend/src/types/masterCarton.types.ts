export interface CreateMasterCartonRequest {
  label?: string;
  max_child_boxes?: number;
}

export interface PackChildBoxRequest {
  child_box_id: string;
  master_carton_id: string;
}

export interface UnpackChildBoxRequest {
  child_box_id: string;
  master_carton_id: string;
}

export interface RepackChildBoxRequest {
  child_box_id: string;
  source_carton_id: string;
  destination_carton_id: string;
}

export interface MasterCartonFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}
