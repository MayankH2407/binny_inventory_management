import api from './api';
import type { MasterCarton, CreateMasterCartonRequest, AssortmentItem } from '@/types';

export interface MasterCartonListResponse {
  data: MasterCarton[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const masterCartonService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<MasterCartonListResponse> {
    const response = await api.get<MasterCartonListResponse>('/master-cartons', { params });
    return response.data;
  },

  async getById(id: string): Promise<MasterCarton> {
    const response = await api.get<MasterCarton>(`/master-cartons/${id}`);
    return response.data;
  },

  async getByBarcode(barcode: string): Promise<MasterCarton> {
    const response = await api.get<MasterCarton>(`/master-cartons/qr/${barcode}`);
    return response.data;
  },

  async create(data: CreateMasterCartonRequest): Promise<MasterCarton> {
    const response = await api.post<MasterCarton>('/master-cartons', data);
    return response.data;
  },

  async addChildBoxes(id: string, barcodes: string[]): Promise<MasterCarton> {
    const response = await api.post<MasterCarton>(`/master-cartons/${id}/add-boxes`, {
      child_box_barcodes: barcodes,
    });
    return response.data;
  },

  async removeChildBoxes(id: string, barcodes: string[]): Promise<MasterCarton> {
    const response = await api.post<MasterCarton>(`/master-cartons/${id}/remove-boxes`, {
      child_box_barcodes: barcodes,
    });
    return response.data;
  },

  async close(id: string): Promise<MasterCarton> {
    const response = await api.post<MasterCarton>(`/master-cartons/${id}/close`);
    return response.data;
  },

  async fullUnpack(id: string): Promise<MasterCarton> {
    const response = await api.post<MasterCarton>(`/master-cartons/${id}/full-unpack`);
    return response.data;
  },

  async getAssortment(id: string): Promise<AssortmentItem[]> {
    const response = await api.get<AssortmentItem[]>(`/master-cartons/${id}/assortment`);
    return response.data;
  },

  async pack(data: { child_box_id: string; master_carton_id: string }): Promise<any> {
    const response = await api.post('/master-cartons/pack', data);
    return response.data;
  },

  async unpack(data: { child_box_id: string; master_carton_id: string }): Promise<any> {
    const response = await api.post('/master-cartons/unpack', data);
    return response.data;
  },

  async repack(data: { child_box_id: string; source_carton_id: string; destination_carton_id: string }): Promise<any> {
    const response = await api.post('/master-cartons/repack', data);
    return response.data;
  },
};
