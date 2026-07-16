import api from './api';
import type { EcommerceRecord, ChildBoxWithProduct, AssortmentItem, CartonMembership } from '@/types';

export interface EcommerceListResponse {
  data: EcommerceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EcommerceStockRow {
  product_id: string;
  article_name: string;
  colour: string;
  size: string;
  sku: string;
  mrp: number;
  allocated_boxes: number;
  allocated_pairs: number;
  available_boxes: number;
  available_pairs: number;
}

export interface EcommerceSummary {
  total: number;
  created: number;
  active: number;
  closed: number;
  dispatched: number;
  totalBoxes: number;
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
    carton_barcodes?: string[];
  }): Promise<EcommerceRecord> {
    const response = await api.post<EcommerceRecord>('/ecommerce', data);
    return response.data;
  },

  async addBox(data: { child_box_id: string; ecommerce_record_id: string }): Promise<any> {
    const response = await api.post('/ecommerce/add-box', data);
    return response.data;
  },

  // Scan a whole master carton → adds ALL its packed boxes into this record at once.
  // The carton itself stays intact (PACKED boxes, mapping-based) — it is not unpacked/emptied.
  async scanCarton(data: { ecommerce_record_id: string; carton_barcode: string }): Promise<{ added: number; cartonBarcode: string }> {
    const response = await api.post('/ecommerce/scan-carton', data);
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

  async getStockSummary(): Promise<EcommerceStockRow[]> {
    const response = await api.get<EcommerceStockRow[]>('/ecommerce/stock-summary');
    return response.data;
  },

  async getSummary(): Promise<EcommerceSummary> {
    const response = await api.get<EcommerceSummary>('/ecommerce/summary');
    return response.data;
  },

  async getChildren(id: string): Promise<ChildBoxWithProduct[]> {
    const response = await api.get<ChildBoxWithProduct[]>(`/ecommerce/${id}/children`);
    return response.data;
  },

  async getCartons(id: string): Promise<CartonMembership[]> {
    const response = await api.get<CartonMembership[]>(`/ecommerce/${id}/cartons`);
    return response.data;
  },
};
