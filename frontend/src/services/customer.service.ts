import api from './api';
import type { Customer, CreateCustomerRequest, UpdateCustomerRequest } from '@/types';

export interface CustomerListResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
};
