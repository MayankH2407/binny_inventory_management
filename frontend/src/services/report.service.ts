import api from './api';
import type { SampleReportResponse, EcommerceReportResponse } from '@/types';

export const reportService = {
  async getInventorySummary() {
    const response = await api.get('/reports/inventory-summary');
    return response.data;
  },

  async getProductWiseReport() {
    const response = await api.get('/reports/product-wise');
    return response.data;
  },

  async getDispatchSummary(params?: { from_date?: string; to_date?: string }) {
    const response = await api.get('/reports/dispatch-summary', { params });
    return response.data;
  },

  async getDailyActivity(params: { from_date: string; to_date: string }) {
    const response = await api.get('/reports/daily-activity', { params });
    return response.data;
  },

  async getCartonInventory() {
    const response = await api.get('/reports/carton-inventory');
    return response.data;
  },

  async getSampleReport(params?: {
    from?: string;
    to?: string;
    status?: string;
    customer_id?: string;
  }): Promise<SampleReportResponse> {
    const response = await api.get<SampleReportResponse>('/reports/samples', { params });
    return response.data;
  },

  async getEcommerceReport(params?: {
    from?: string;
    to?: string;
    status?: string;
    marketplace?: string;
  }): Promise<EcommerceReportResponse> {
    const response = await api.get<EcommerceReportResponse>('/reports/ecommerce', { params });
    return response.data;
  },

  async exportCSV(endpoint: string, params?: Record<string, string>) {
    const response = await api.get(endpoint, { params, responseType: 'blob' });
    return response.data;
  },

  async exportSampleReportCsv(params?: {
    from?: string;
    to?: string;
    status?: string;
    customer_id?: string;
  }) {
    const response = await api.get('/reports/samples/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  async exportEcommerceReportCsv(params?: {
    from?: string;
    to?: string;
    status?: string;
    marketplace?: string;
  }) {
    const response = await api.get('/reports/ecommerce/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};
