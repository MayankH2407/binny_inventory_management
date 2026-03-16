import api from './api';

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

  async exportCSV(endpoint: string, params?: Record<string, string>) {
    const response = await api.get(endpoint, { params, responseType: 'blob' });
    return response.data;
  },
};
