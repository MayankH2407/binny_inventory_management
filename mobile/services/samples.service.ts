import api from './api';
import type { SampleRecord, SampleItem, SampleSummary, SampleLookupResult, Foot, AssortmentItem, SampleState } from '../types';

export interface SampleListResponse {
  data: SampleRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Pool-based Samples API — mirrors the web app's sample.service.ts. The old
// add-box / scan-carton / remove-box / close / full-unpack / children / cartons
// endpoints no longer exist on the backend.
export const samplesService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    state?: SampleState;
    search?: string;
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

  async lookup(barcode: string): Promise<SampleLookupResult> {
    const response = await api.get<SampleLookupResult>(`/samples/lookup/${encodeURIComponent(barcode)}`);
    return response.data;
  },

  // One-click "New Sample" — mints an empty record.
  async create(data?: { name?: string }): Promise<SampleRecord> {
    const response = await api.post<SampleRecord>('/samples', data ?? {});
    return response.data;
  },

  async getContents(id: string): Promise<SampleItem[]> {
    const response = await api.get<SampleItem[]>(`/samples/${id}/contents`);
    return response.data;
  },

  async getAssortment(id: string): Promise<AssortmentItem[]> {
    const response = await api.get<AssortmentItem[]>(`/samples/${id}/assortment`);
    return response.data;
  },

  // Single scan input — the server resolves box vs. carton. `foot` only applies to a loose box.
  async scan(id: string, data: { barcode: string; foot?: Foot }): Promise<{
    item_type: 'BOX' | 'CARTON'; barcode: string; boxes_added: number; mapping_id: string; foot: Foot;
  }> {
    const response = await api.post(`/samples/${id}/scan`, data);
    return response.data;
  },

  // All-or-nothing: every box in the carton comes out as loose items.
  async unpackCarton(id: string, mapping_id: string): Promise<{
    master_carton_id: string; carton_barcode: string; boxes_unpacked: number;
  }> {
    const response = await api.post(`/samples/${id}/unpack-carton`, { mapping_id });
    return response.data;
  },

  async setFoot(id: string, data: { mapping_id: string; foot: Foot }): Promise<{ mapping_id: string; barcode: string; foot: Foot }> {
    const response = await api.post(`/samples/${id}/set-foot`, data);
    return response.data;
  },

  async remove(id: string, data: { item_type: 'BOX' | 'CARTON'; mapping_id: string }): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string }> {
    const response = await api.post(`/samples/${id}/remove`, data);
    return response.data;
  },

  // Safety valve: empty the whole sample back to available stock.
  async clear(id: string): Promise<{ released_boxes: number; released_cartons: number }> {
    const response = await api.post(`/samples/${id}/clear`);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/samples/${id}`);
  },
};
