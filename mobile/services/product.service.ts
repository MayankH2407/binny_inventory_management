import api from './api';
import type { Product, ProductSection } from '../types';

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
    section?: string;
    category?: string;
    is_active?: boolean;
  }): Promise<ProductListResponse> {
    const response = await api.get<ProductListResponse>('/products', { params });
    return response.data;
  },

  async getById(id: string): Promise<Product> {
    const response = await api.get<Product>(`/products/${id}`);
    return response.data;
  },

  async getColours(id: string): Promise<string[]> {
    const response = await api.get<string[]>(`/products/${id}/colours`);
    return response.data;
  },

  async getSizes(id: string): Promise<Product[]> {
    const response = await api.get<Product[]>(`/products/${id}/sizes`);
    return response.data;
  },

  async getSections(): Promise<ProductSection[]> {
    const response = await api.get<ProductSection[]>('/sections');
    return response.data;
  },
};
