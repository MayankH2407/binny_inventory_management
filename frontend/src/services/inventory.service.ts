import api from './api';
import type { DashboardStats, TraceabilityResult, UnpackRequest, CartonStockNode, CartonHierarchyLevel } from '@/types';

export const inventoryService = {
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await api.get<DashboardStats>('/inventory/dashboard');
    return response.data;
  },

  async trace(barcode: string): Promise<TraceabilityResult> {
    const response = await api.get<TraceabilityResult>(`/inventory/trace/${barcode}`);
    return response.data;
  },

  async unpack(data: UnpackRequest): Promise<void> {
    await api.post('/inventory/unpack', data);
  },

  async getCartonHierarchy(
    level: CartonHierarchyLevel,
    filters: {
      status?: string;
      section?: string;
      article_name?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ data: CartonStockNode[]; meta?: { page: number; limit: number; total: number; totalPages: number } }> {
    const params = new URLSearchParams({
      level,
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])
      ),
    });
    const res = await api.get(`/inventory/cartons/hierarchy?${params}`);
    // The api interceptor unwraps: for paginated (meta present) → { data, page, limit, total, totalPages }
    // For non-paginated → raw array. Normalise both shapes.
    const raw = res.data;
    if (Array.isArray(raw)) {
      return { data: raw };
    }
    if (raw && Array.isArray(raw.data)) {
      const { data, page, limit, total, totalPages } = raw as {
        data: CartonStockNode[];
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
      };
      if (page !== undefined) {
        return { data, meta: { page: page!, limit: limit!, total: total!, totalPages: totalPages! } };
      }
      return { data };
    }
    return { data: [] };
  },

  async exportCartonHierarchyCsv(
    level: CartonHierarchyLevel,
    filters: {
      status?: string;
      section?: string;
      article_name?: string;
      search?: string;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams({
      level,
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])
      ),
    });
    const res = await api.get(`/inventory/cartons/export?${params}`, { responseType: 'blob' });
    return res.data;
  },
};
