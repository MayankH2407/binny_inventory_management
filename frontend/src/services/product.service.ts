import api from './api';
import type { Product, ProductSection } from '@/types';

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
    section?: string;
    category?: string;
    location?: string;
    colour?: string;
    size?: string;
    article_name?: string;
    article_group?: string;
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

  async uploadImage(productId: string, file: File): Promise<{ image_url: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post<{ image_url: string }>(`/products/${productId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async getSections(): Promise<ProductSection[]> {
    const response = await api.get<ProductSection[]>('/sections');
    return response.data;
  },
};
