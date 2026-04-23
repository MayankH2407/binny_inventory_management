import api from './api';
import type { TraceabilityResult } from '../types';

export const traceService = {
  async traceByBarcode(barcode: string): Promise<TraceabilityResult> {
    const response = await api.get<TraceabilityResult>(`/inventory/trace/${barcode}`);
    return response.data;
  },
};
