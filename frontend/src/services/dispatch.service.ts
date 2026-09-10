import api from './api';
import type { Dispatch, DispatchRecord, CreateDispatchRequest } from '@/types';

export interface PartyWiseDispatchRow {
  party_name: string;
  product_name: string;
  size_group: string;
  qty: number;
  master_carton_count: number;
}

export interface DispatchListResponse {
  data: DispatchRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const dispatchService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    destination?: string;
    from_date?: string;
    to_date?: string;
    return_status?: 'none' | 'partial' | 'full';
  }): Promise<DispatchListResponse> {
    const response = await api.get<DispatchListResponse>('/dispatches', { params });
    return response.data;
  },

  async getById(id: string): Promise<DispatchRecord> {
    const response = await api.get<DispatchRecord>(`/dispatches/${id}`);
    return response.data;
  },

  async create(data: CreateDispatchRequest): Promise<DispatchRecord> {
    const response = await api.post<DispatchRecord>('/dispatches', data);
    return response.data;
  },

  async markDelivered(id: string): Promise<Dispatch> {
    const response = await api.post<Dispatch>(`/dispatches/${id}/deliver`);
    return response.data;
  },

  async getTodayCount(): Promise<number> {
    const response = await api.get<{ count: number }>('/dispatches/today/count');
    return response.data.count;
  },

  // Party-wise dispatch CSV for a date range (Party Name | Product Name |
  // Size Group | Qty | Master Carton), all 3 source types included.
  async exportCsv(params?: { from_date?: string; to_date?: string }): Promise<Blob> {
    const response = await api.get('/dispatches/export', {
      params,
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  // Same aggregation as exportCsv, as JSON — used to render the "Download PDF
  // Summary" print view so it can never disagree with the CSV.
  async getSummary(params?: { from_date?: string; to_date?: string }): Promise<PartyWiseDispatchRow[]> {
    const response = await api.get<PartyWiseDispatchRow[]>('/dispatches/export/summary', { params });
    return response.data;
  },
};
