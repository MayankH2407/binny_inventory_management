import api from './api';
import type { DashboardStats } from '../types';

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    const response = await api.get<DashboardStats>('/inventory/dashboard');
    return response.data;
  },
};
