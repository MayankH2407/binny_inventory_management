import api from './api';
import type { Customer, CreateCustomerRequest, UpdateCustomerRequest } from '@/types';

export interface CustomerListResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CustomerBulkRowError {
  row: number;
  status: 'error';
  firm_name?: string;
  error?: string;
}

export interface CustomerBulkUploadResult {
  created: number;
  errors: CustomerBulkRowError[];
}

export const customerService = {
  async getAll(params?: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
    customer_type?: string;
  }): Promise<CustomerListResponse> {
    const response = await api.get<CustomerListResponse>('/customers', { params });
    return response.data;
  },

  async getById(id: string): Promise<Customer> {
    const response = await api.get<Customer>(`/customers/${id}`);
    return response.data;
  },

  async create(data: CreateCustomerRequest): Promise<Customer> {
    const response = await api.post<Customer>('/customers', data);
    return response.data;
  },

  async update(id: string, data: UpdateCustomerRequest): Promise<Customer> {
    const response = await api.put<Customer>(`/customers/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/customers/${id}`);
  },

  async getPrimaryDealers(): Promise<Customer[]> {
    const response = await api.get<Customer[]>('/customers/primary-dealers');
    return response.data;
  },

  async getSubDealers(primaryDealerId: string): Promise<Customer[]> {
    const response = await api.get<Customer[]>(`/customers/${primaryDealerId}/sub-dealers`);
    return response.data;
  },

  async bulkUpload(file: File): Promise<CustomerBulkUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<CustomerBulkUploadResult>('/customers/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getSampleCsvUrl(): string {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    return `${base}/customers/bulk-upload/sample`;
  },
};
