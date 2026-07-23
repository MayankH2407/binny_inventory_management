import api from './api';
import type { SampleRecord, ChildBoxWithProduct, AssortmentItem, CartonMembership } from '../types';

export interface SampleListResponse {
  data: SampleRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const samplesService = {
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

  async getById(id: string): Promise<SampleRecord> {
    const response = await api.get<SampleRecord>(`/samples/${id}`);
    return response.data;
  },

  async getByBarcode(barcode: string): Promise<SampleRecord> {
    const response = await api.get<SampleRecord>(`/samples/qr/${barcode}`);
    return response.data;
  },

  async create(data: {
    name: string;
    customer_id?: string | null;
    recipient_name?: string | null;
    purpose?: string | null;
    sample_date?: string | null;
    notes?: string | null;
    child_box_barcodes?: string[];
    carton_barcodes?: string[];
  }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples', data);
    return response.data;
  },

  async addBox(data: { child_box_id: string; sample_record_id: string }): Promise<any> {
    const response = await api.post('/samples/add-box', data);
    return response.data;
  },

  // Scan a whole master carton → adds ALL its packed boxes into this sample at once.
  // The carton itself stays intact (PACKED boxes, mapping-based) — it is not unpacked/emptied.
  async scanCarton(data: { sample_record_id: string; carton_barcode: string }): Promise<{ added: number; cartonBarcode: string }> {
    const response = await api.post('/samples/scan-carton', data);
    return response.data;
  },

  async getCartons(id: string): Promise<CartonMembership[]> {
    const response = await api.get<CartonMembership[]>(`/samples/${id}/cartons`);
    return response.data;
  },

  async removeBox(data: { child_box_id: string; sample_record_id: string }): Promise<any> {
    const response = await api.post('/samples/remove-box', data);
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

  async getChildren(id: string): Promise<ChildBoxWithProduct[]> {
    const response = await api.get<ChildBoxWithProduct[]>(`/samples/${id}/children`);
    return response.data;
  },
};
