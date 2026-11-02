import api from './api';
import type { MasterCarton, CreateMasterCartonRequest, AssortmentItem } from '../types';

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

  async getAssortment(id: string): Promise<AssortmentItem[]> {
    const response = await api.get<AssortmentItem[]>(`/master-cartons/${id}/assortment`);
    return response.data;
  },

  async fullUnpack(id: string): Promise<void> {
    await api.post(`/master-cartons/${id}/full-unpack`);
  },

  async closeCarton(id: string): Promise<MasterCarton> {
    const response = await api.post<MasterCarton>(`/master-cartons/${id}/close`);
    return response.data;
  },

  // Pack one box into a carton by its barcode. Idempotent per (box, carton): a re-scan of a
  // box already in THIS carton returns alreadyPacked:true instead of an error. The old
  // source→destination `repack` endpoint no longer exists — repacking is now
  // fullUnpack + packByBarcode (same as the web's Unpack & Repack page).
  async packByBarcode(data: { barcode: string; master_carton_id: string }): Promise<{
    carton: MasterCarton | null;
    alreadyPacked: boolean;
    childBoxBarcode: string;
  }> {
    const response = await api.post('/master-cartons/pack-by-barcode', data);
    return response.data;
  },
};
