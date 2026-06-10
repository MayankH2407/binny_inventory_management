import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
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
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const url = originalRequest?.url || '';
    const isAuthEndpoint = url.includes('/auth/refresh') || url.includes('/auth/login');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        clearSessionAndRedirect();
        return Promise.reject(refreshError);
      }
    }

    // For 401 on auth endpoints (login failed, refresh failed when called directly),
    // or any other 401 we can't recover from, drop the session.
    if (error.response?.status === 401 && !isAuthEndpoint) {
      clearSessionAndRedirect();
    }

    return Promise.reject(error);
  }
);

let inflightRefresh: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    // The refresh token lives in an httpOnly cookie; withCredentials sends it automatically.
    // _retry is set so the response interceptor won't recurse on us.
    const config: AxiosRequestConfig & { _retry?: boolean } = { _retry: true };
    const res = await api.post('/auth/refresh', {}, config);
    // Response interceptor has already unwrapped { success, message, data } → response.data is { accessToken }
    const newToken: string | undefined = res.data?.accessToken;
    if (!newToken) {
      throw new Error('Refresh response missing accessToken');
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('binny_token', newToken);
    }
    return newToken;
  })();

  try {
    return await inflightRefresh;
  } finally {
    inflightRefresh = null;
  }
}

function clearSessionAndRedirect(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('binny_token');
  localStorage.removeItem('binny_user');
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const currentPath = window.location.pathname;
  if (!currentPath.endsWith('/login')) {
    window.location.href = `${basePath}/login`;
  }
}

export default api;
