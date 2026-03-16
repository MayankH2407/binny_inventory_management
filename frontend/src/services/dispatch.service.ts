import api from './api';
import type { Dispatch, DispatchRecord, CreateDispatchRequest } from '@/types';

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
};
