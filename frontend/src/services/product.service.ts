import api from './api';
import type { Product } from '@/types';

export interface ProductListResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const productService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
  }): Promise<ProductListResponse> {
    const response = await api.get<ProductListResponse>('/products', { params });
    return response.data;
  },

  async getById(id: string): Promise<Product> {
    const response = await api.get<Product>(`/products/${id}`);
    return response.data;
  },

  async create(data: Record<string, unknown>): Promise<Product> {
    const response = await api.post<Product>('/products', data);
    return response.data;
  },

  async update(id: string, data: Record<string, unknown>): Promise<Product> {
    const response = await api.put<Product>(`/products/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },

  async getColours(productId: string): Promise<{ colour: string; product_id: string }[]> {
    const response = await api.get<{ colour: string; product_id: string }[]>(`/products/${productId}/colours`);
    return response.data;
  },

  async getSizes(productId: string): Promise<Product[]> {
    const response = await api.get<Product[]>(`/products/${productId}/sizes`);
    return response.data;
  },
};
