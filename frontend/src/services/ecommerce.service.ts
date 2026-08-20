import api from './api';
import type {
  EcommerceRecord,
  ChildBoxWithProduct,
  AssortmentItem,
  CartonMembership,
  EcommercePoolItem,
  EcommercePoolSummary,
  EcommercePoolLookup,
} from '@/types';

export interface EcommerceListResponse {
  data: EcommerceRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EcommercePoolListResponse {
  data: EcommercePoolItem[];
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

  // ── E-commerce Area pool ──────────────────────────────────────────────
  // Replaces the old record-scoped create/addBox/scanCarton/removeBox/close/
  // fullUnpack flows with a single unordered pool of loose boxes / whole
  // cartons sitting in the E-commerce Area.

  async getPool(params?: {
    page?: number;
    limit?: number;
    search?: string;
    item_type?: 'BOX' | 'CARTON';
  }): Promise<EcommercePoolListResponse> {
    const response = await api.get<EcommercePoolListResponse>('/ecommerce/pool', { params });
    return response.data;
  },

  async getPoolSummary(): Promise<EcommercePoolSummary> {
    const response = await api.get<EcommercePoolSummary>('/ecommerce/pool/summary');
    return response.data;
  },

  async lookupPoolItem(barcode: string): Promise<EcommercePoolLookup> {
    const response = await api.get<EcommercePoolLookup>(
      `/ecommerce/pool/lookup/${encodeURIComponent(barcode)}`
    );
    return response.data;
  },

  async addToPool(
    barcode: string
  ): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string; boxes_added: number; mapping_id: string }> {
    const response = await api.post('/ecommerce/pool/scan', { barcode });
    return response.data;
  },

  async removeFromPool(data: {
    item_type: 'BOX' | 'CARTON';
    mapping_id: string;
  }): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string }> {
    const response = await api.post('/ecommerce/pool/remove', data);
    return response.data;
  },

  async unpackPoolCarton(
    mapping_id: string
  ): Promise<{ master_carton_id: string; carton_barcode: string; boxes_unpacked: number }> {
    const response = await api.post('/ecommerce/pool/unpack-carton', { mapping_id });
    return response.data;
  },
};
