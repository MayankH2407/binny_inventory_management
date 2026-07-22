import api from './api';
import type { ReturnRecord, ReturnableItem, CreateReturnRequest } from '@/types';

export interface ReturnListResponse {
  data: ReturnRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReturnDispatchItemsResponse {
  dispatch: {
    id: string;
    source_type: string;
    source_label?: string | null;
    customer_firm_name?: string | null;
    dispatch_date: string;
  };
  items: ReturnableItem[];
}

export const returnsService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<ReturnListResponse> {
    const response = await api.get<ReturnListResponse>('/returns', { params });
    return response.data;
  },

  async getById(id: string): Promise<ReturnRecord> {
    const response = await api.get<ReturnRecord>(`/returns/${id}`);
    return response.data;
  },

  async lookup(barcode: string): Promise<ReturnableItem> {
    const response = await api.get<ReturnableItem>(`/returns/lookup/${barcode}`);
    return response.data;
  },

  async getDispatchItems(dispatchId: string): Promise<ReturnDispatchItemsResponse> {
    const response = await api.get<ReturnDispatchItemsResponse>(`/returns/dispatch/${dispatchId}/items`);
    return response.data;
  },

  async create(data: CreateReturnRequest): Promise<ReturnRecord> {
    const response = await api.post<ReturnRecord>('/returns', data);
    return response.data;
  },

  async exportCsv(params?: { from_date?: string; to_date?: string }): Promise<Blob> {
    const response = await api.get('/returns/export', {
      params,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};
