import api from './api';
import type {
  InventorySummaryResponse,
  ProductWiseRow,
  CartonRow,
  DispatchSummary,
  DailyActivityRow,
} from '../types';

export const reportService = {
  async getInventorySummary(): Promise<InventorySummaryResponse> {
    const response = await api.get<InventorySummaryResponse>('/reports/inventory-summary');
    return response.data;
  },

  async getProductWiseReport(): Promise<ProductWiseRow[]> {
    const response = await api.get<ProductWiseRow[]>('/reports/product-wise');
    return response.data;
  },

  async getDispatchSummary(params?: {
    from_date?: string;
    to_date?: string;
  }): Promise<DispatchSummary> {
    const response = await api.get<DispatchSummary>('/reports/dispatch-summary', { params });
    return response.data;
  },

  async getDailyActivity(params: {
    from_date: string;
    to_date: string;
  }): Promise<DailyActivityRow[]> {
    const response = await api.get<DailyActivityRow[]>('/reports/daily-activity', { params });
    return response.data;
  },

  async getCartonInventory(): Promise<CartonRow[]> {
    const response = await api.get<CartonRow[]>('/reports/carton-inventory');
    return response.data;
  },
};
