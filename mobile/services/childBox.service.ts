import api from './api';
import type { ChildBoxWithProduct, BulkCreateChildBoxRequest, BulkCreateMultiSizeRequest } from '../types';

export interface ChildBoxListResponse {
  data: ChildBoxWithProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const childBoxService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    status?: string;
    product_id?: string;
    search?: string;
  }): Promise<ChildBoxListResponse> {
    const response = await api.get<ChildBoxListResponse>('/child-boxes', { params });
    return response.data;
  },

  async getById(id: string): Promise<ChildBoxWithProduct> {
    const response = await api.get<ChildBoxWithProduct>(`/child-boxes/${id}`);
    return response.data;
  },

  async getByBarcode(barcode: string): Promise<ChildBoxWithProduct> {
    const response = await api.get<ChildBoxWithProduct>(`/child-boxes/qr/${barcode}`);
    return response.data;
  },

  async createBulk(data: BulkCreateChildBoxRequest): Promise<ChildBoxWithProduct[]> {
    const response = await api.post<ChildBoxWithProduct[]>('/child-boxes/bulk', data);
    return response.data;
  },

  async bulkCreateMultiSize(data: BulkCreateMultiSizeRequest): Promise<ChildBoxWithProduct[]> {
    const response = await api.post<ChildBoxWithProduct[]>('/child-boxes/bulk-multi-size', data);
    return response.data;
  },

  async getFree(params?: { product_id?: string }): Promise<ChildBoxWithProduct[]> {
    const response = await api.get<ChildBoxWithProduct[]>('/child-boxes/free', { params });
    return response.data;
  },
};
