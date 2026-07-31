import api from './api';
import type { SampleRecord, SampleChildBoxRow, AssortmentItem, CartonMembership } from '@/types';

export interface SampleListResponse {
  data: SampleRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SampleSummary {
  total: number;
  created: number;
  active: number;
  closed: number;
  dispatched: number;
  totalBoxes: number;
}

export const sampleService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    customer_id?: string;
  }): Promise<SampleListResponse> {
    const response = await api.get<SampleListResponse>('/samples', { params });
    return response.data;
  },

  async getSummary(): Promise<SampleSummary> {
    const response = await api.get<SampleSummary>('/samples/summary');
    return response.data;
  },

  async getById(id: string): Promise<SampleRecord> {
    const response = await api.get<SampleRecord>(`/samples/${id}`);
    return response.data;
  },

  async getByBarcode(barcode: string): Promise<SampleRecord> {
    const response = await api.get<SampleRecord>(`/samples/qr/${barcode}`);
    return response.data;
  },

  async create(data: {
    // Optional — the backend auto-generates a sensible default when omitted.
    name?: string | null;
    customer_id?: string | null;
    recipient_name?: string | null;
    purpose?: string | null;
    sample_date?: string | null;
    notes?: string | null;
    child_box_barcodes?: string[];
    box_feet?: Record<string, 'LEFT' | 'RIGHT' | 'PAIR'>;
    carton_barcodes?: string[];
  }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples', data);
    return response.data;
  },

  async addBox(data: { child_box_id: string; sample_record_id: string; foot?: 'LEFT' | 'RIGHT' | 'PAIR' }): Promise<any> {
    const response = await api.post('/samples/add-box', data);
    return response.data;
  },

  // Scan a whole master carton → adds ALL its packed boxes into this sample at once.
  // The carton itself stays intact (PACKED boxes, mapping-based) — it is not unpacked/emptied.
  async scanCarton(data: { sample_record_id: string; carton_barcode: string }): Promise<{ added: number; cartonBarcode: string }> {
    const response = await api.post('/samples/scan-carton', data);
    return response.data;
  },

  // mapping_id is preferred (unambiguous — a sample can hold both feet of one
  // box as two separate mappings). child_box_id is kept for back-compat.
  async removeBox(data: { mapping_id?: string; child_box_id?: string; sample_record_id: string }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples/remove-box', data);
    return response.data;
  },

  // Take specific boxes out of a whole-carton allocation — they become loose,
  // individually-tracked (foot-splittable) sample items. Optionally also
  // release the rest of the carton back to stock in the same call.
  async takeOutCartonBoxes(data: {
    sample_record_id: string;
    master_carton_id: string;
    child_box_ids: string[];
    box_feet?: Record<string, 'LEFT' | 'RIGHT' | 'PAIR'>;
    release_carton?: boolean;
  }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples/take-out-carton-boxes', data);
    return response.data;
  },

  // Release a whole carton allocation back to stock, untouched.
  async removeCarton(data: { sample_record_id: string; master_carton_id: string }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples/remove-carton', data);
    return response.data;
  },

  // Change the foot on an existing loose mapping — e.g. "send just the left
  // shoe" as a deliberate action after the box is already in the sample.
  async setBoxFoot(data: { sample_record_id: string; mapping_id: string; foot: 'LEFT' | 'RIGHT' | 'PAIR' }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples/set-box-foot', data);
    return response.data;
  },

  async close(id: string): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>(`/samples/${id}/close`);
    return response.data;
  },

  async fullUnpack(id: string): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>(`/samples/${id}/full-unpack`);
    return response.data;
  },

  async getAssortment(id: string): Promise<AssortmentItem[]> {
    const response = await api.get<AssortmentItem[]>(`/samples/${id}/assortment`);
    return response.data;
  },

  async getChildren(id: string): Promise<SampleChildBoxRow[]> {
    const response = await api.get<SampleChildBoxRow[]>(`/samples/${id}/children`);
    return response.data;
  },

  async getCartons(id: string): Promise<CartonMembership[]> {
    const response = await api.get<CartonMembership[]>(`/samples/${id}/cartons`);
    return response.data;
  },
};
