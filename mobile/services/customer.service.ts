import api from './api';
import type { Customer, CreateCustomerRequest } from '../types';

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

  async update(id: string, data: Partial<CreateCustomerRequest>): Promise<Customer> {
    const response = await api.put<Customer>(`/customers/${id}`, data);
    return response.data;
  },

  async getPrimaryDealers(): Promise<Customer[]> {
    const response = await api.get<Customer[]>('/customers/primary-dealers');
    return response.data;
  },
};
