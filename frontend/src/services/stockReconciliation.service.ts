import api from './api';
import type {
  StockReconSession,
  StockReconScanResult,
  StockReconProgress,
  StockReconVariance,
  StockReconScope,
} from '@/types';

export interface StockReconSessionListResponse {
  data: StockReconSession[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ScanBatchItem {
  client_scan_id: string;
  raw_payload: string;
  contents_mismatch?: boolean;
  is_manual?: boolean;
  scanned_at?: string;
}

export interface ScanHistoryRow {
  id: string;
  client_scan_id: string;
  raw_payload: string;
  resolved_code: string;
  scan_type: 'BOX' | 'CARTON' | 'UNKNOWN';
  result: 'OK' | 'DUPLICATE' | 'NOT_EXPECTED' | 'OUT_OF_SCOPE' | 'STATUS_CONFLICT' | 'UNKNOWN';
  contents_mismatch: boolean;
  is_manual: boolean;
  scanned_at: string;
  created_at: string;
}

export interface ScanHistoryResponse {
  data: ScanHistoryRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const stockReconciliationService = {
  async getAll(params?: { page?: number; limit?: number; status?: string }): Promise<StockReconSessionListResponse> {
    const response = await api.get<StockReconSessionListResponse>('/stock-reconciliations', { params });
    return response.data;
  },

  async getById(id: string): Promise<StockReconSession> {
    const response = await api.get<StockReconSession>(`/stock-reconciliations/${id}`);
    return response.data;
  },

  async getProgress(id: string): Promise<StockReconProgress> {
    const response = await api.get<StockReconProgress>(`/stock-reconciliations/${id}/progress`);
    return response.data;
  },

  async getVariance(id: string): Promise<StockReconVariance> {
    const response = await api.get<StockReconVariance>(`/stock-reconciliations/${id}/variance`);
    return response.data;
  },

  async exportVarianceCsv(id: string): Promise<Blob> {
    const response = await api.get(`/stock-reconciliations/${id}/variance`, {
      params: { format: 'csv' },
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  async open(data: { scope: StockReconScope; notes?: string }): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>('/stock-reconciliations', data);
    return response.data;
  },

  async submitScans(id: string, scans: ScanBatchItem[]): Promise<{ results: StockReconScanResult[] }> {
    const response = await api.post<{ results: StockReconScanResult[] }>(`/stock-reconciliations/${id}/scans`, { scans });
    return response.data;
  },

  async getScans(id: string, params?: { page?: number; limit?: number }): Promise<ScanHistoryResponse> {
    const response = await api.get<ScanHistoryResponse>(`/stock-reconciliations/${id}/scans`, { params });
    return response.data;
  },

  async submit(id: string): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>(`/stock-reconciliations/${id}/submit`);
    return response.data;
  },

  async cancel(id: string): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>(`/stock-reconciliations/${id}/cancel`);
    return response.data;
  },

  async approve(id: string): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>(`/stock-reconciliations/${id}/approve`);
    return response.data;
  },

  async reject(id: string, reason: string): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>(`/stock-reconciliations/${id}/reject`, { reason });
    return response.data;
  },

  async post(id: string): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>(`/stock-reconciliations/${id}/post`);
    return response.data;
  },

  async recount(id: string): Promise<StockReconSession> {
    const response = await api.post<StockReconSession>(`/stock-reconciliations/${id}/recount`);
    return response.data;
  },
};
