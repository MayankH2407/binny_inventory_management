import api from './api';
import type { ChildBox, ChildBoxWithProduct, BulkCreateChildBoxRequest, BulkCreateMultiSizeRequest } from '@/types';

export interface BulkRowError {
  row: number;
  sku?: string;
  error: string;
}

export interface BulkUploadResult {
  totalRows: number;
  created: number;
  errors: BulkRowError[];
  createdBarcodes: string[];
}

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

  async create(data: { product_id: string; quantity?: number }): Promise<ChildBox> {
    const response = await api.post<ChildBox>('/child-boxes', data);
    return response.data;
  },

  async createBulk(data: BulkCreateChildBoxRequest): Promise<ChildBoxWithProduct[]> {
    const response = await api.post<ChildBoxWithProduct[]>('/child-boxes/bulk', data);
    return response.data;
  },

  async getFree(): Promise<ChildBoxWithProduct[]> {
    const response = await api.get<ChildBoxWithProduct[]>('/child-boxes/free');
    return response.data;
  },

  async bulkCreateMultiSize(data: BulkCreateMultiSizeRequest): Promise<ChildBoxWithProduct[]> {
    const response = await api.post<ChildBoxWithProduct[]>('/child-boxes/bulk-multi-size', data);
    return response.data;
  },

  async bulkUpload(file: File): Promise<BulkUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<BulkUploadResult>('/child-boxes/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async activate(id: string): Promise<ChildBoxWithProduct> {
    const response = await api.post<ChildBoxWithProduct>(`/child-boxes/${id}/activate`);
    return response.data;
  },

  async logReprint(barcodes: string[]): Promise<void> {
    try {
      await api.post('/child-boxes/reprint-log', { barcodes });
    } catch {
      /* best-effort audit log; never block printing */
    }
  },

  getSampleCsvUrl(): string {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    return `${base}/child-boxes/bulk-upload/sample`;
  },
};
