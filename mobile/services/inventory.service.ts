import api from './api';
import type { InventoryStockSummary, InventoryHierarchyItem, CartonHierarchyLevel, CartonStockNode } from '../types';

export const inventoryService = {
  async getStockSummary(): Promise<InventoryStockSummary> {
    const response = await api.get<InventoryStockSummary>('/inventory/stock/summary');
    return response.data;
  },

  async getStockHierarchy(params: {
    level: 'section' | 'article_name' | 'mrp' | 'colour' | 'product';
    section?: string;
    article_name?: string;
    mrp?: string;
    colour?: string;
  }): Promise<InventoryHierarchyItem[]> {
    const response = await api.get<InventoryHierarchyItem[]>('/inventory/stock/hierarchy', { params });
    return response.data;
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
};
