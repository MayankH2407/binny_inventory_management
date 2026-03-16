import api from './api';
import type { DashboardStats, TraceabilityResult, UnpackRequest } from '@/types';

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
};
