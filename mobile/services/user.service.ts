import api from './api';
import type { User, CreateUserRequest, UpdateUserRequest } from '../types';

export interface UserListResponse {
  data: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const userService = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    is_active?: boolean;
  }) =>
    api.get<UserListResponse>('/users', { params }).then((r) => r.data),

  getById: (id: string) =>
    api.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: CreateUserRequest) =>
    api.post<User>('/users', data).then((r) => r.data),

  update: (id: string, data: UpdateUserRequest) =>
    api.put<User>(`/users/${id}`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete<void>(`/users/${id}`).then((r) => r.data),
};
