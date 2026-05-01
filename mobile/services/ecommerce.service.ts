import api from './api';
import type { EcommerceRecord, ChildBoxWithProduct, AssortmentItem } from '../types';

export interface EcommerceListResponse {
  data: EcommerceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const ecommerceService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    marketplace?: string;
  }): Promise<EcommerceListResponse> {
    const response = await api.get<EcommerceListResponse>('/ecommerce', { params });
    return response.data;
  },

  async getById(id: string): Promise<EcommerceRecord> {
    const response = await api.get<EcommerceRecord>(`/ecommerce/${id}`);
    return response.data;
  },

  async getByBarcode(barcode: string): Promise<EcommerceRecord> {
    const response = await api.get<EcommerceRecord>(`/ecommerce/qr/${barcode}`);
    return response.data;
  },

  async create(data: {
    name: string;
    marketplace?: string | null;
    order_reference?: string | null;
    listing_sku?: string | null;
    mapped_date?: string | null;
    notes?: string | null;
    child_box_barcodes?: string[];
  }): Promise<EcommerceRecord> {
    const response = await api.post<EcommerceRecord>('/ecommerce', data);
    return response.data;
  },

  async addBox(data: { child_box_id: string; ecommerce_record_id: string }): Promise<any> {
    const response = await api.post('/ecommerce/add-box', data);
    return response.data;
  },

  async removeBox(data: { child_box_id: string; ecommerce_record_id: string }): Promise<any> {
    const response = await api.post('/ecommerce/remove-box', data);
    return response.data;
  },

  async close(id: string): Promise<EcommerceRecord> {
    const response = await api.post<EcommerceRecord>(`/ecommerce/${id}/close`);
    return response.data;
  },

  async fullUnpack(id: string): Promise<EcommerceRecord> {
    const response = await api.post<EcommerceRecord>(`/ecommerce/${id}/full-unpack`);
    return response.data;
  },

  async getAssortment(id: string): Promise<AssortmentItem[]> {
    const response = await api.get<AssortmentItem[]>(`/ecommerce/${id}/assortment`);
    return response.data;
  },

  async getChildren(id: string): Promise<ChildBoxWithProduct[]> {
    const response = await api.get<ChildBoxWithProduct[]>(`/ecommerce/${id}/children`);
    return response.data;
  },
};
