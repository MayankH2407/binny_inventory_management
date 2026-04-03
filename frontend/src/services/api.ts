import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('binny_token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    // Backend wraps everything in { success, message, data, pagination? }
    // Unwrap so callers get the inner payload directly via response.data
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      // For paginated responses keep pagination alongside data
      const pagination = body.pagination || body.meta;
      if (pagination) {
        response.data = {
          data: body.data,
          ...pagination,
        };
      } else {
        response.data = body.data;
      }
    }
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('binny_token');
        localStorage.removeItem('binny_user');
        const currentPath = window.location.pathname;
        if (currentPath !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
