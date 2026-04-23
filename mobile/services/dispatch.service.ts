import api from './api';
import type { DispatchRecord, CreateDispatchRequest } from '../types';

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
    start_date?: string;
    end_date?: string;
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
};
