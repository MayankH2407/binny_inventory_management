import api from './api';
import type { InventoryStockSummary, InventoryHierarchyItem } from '../types';

export const inventoryService = {
  async getStockSummary(): Promise<InventoryStockSummary> {
    const response = await api.get<InventoryStockSummary>('/inventory/stock/summary');
    return response.data;
  },

  async getStockHierarchy(params: {
    level: 'section' | 'article_name' | 'colour' | 'product';
    section?: string;
    article_name?: string;
    colour?: string;
  }): Promise<InventoryHierarchyItem[]> {
    const response = await api.get<InventoryHierarchyItem[]>('/inventory/stock/hierarchy', { params });
    return response.data;
  },
};
