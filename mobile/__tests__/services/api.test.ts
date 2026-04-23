import * as SecureStore from 'expo-secure-store';

// Capture interceptor callbacks so we can test them directly
let requestInterceptorFulfilled: ((config: any) => any) | null = null;
let responseInterceptorFulfilled: ((response: any) => any) | null = null;
let responseInterceptorRejected: ((error: any) => any) | null = null;

// Mock axios BEFORE importing api so that api.ts uses our mock
jest.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: {
        use: jest.fn((fulfilled) => {
          requestInterceptorFulfilled = fulfilled;
        }),
      },
      response: {
        use: jest.fn((fulfilled, rejected) => {
          responseInterceptorFulfilled = fulfilled;
          responseInterceptorRejected = rejected;
        }),
      },
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    defaults: { headers: { common: {} } },
  };

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => mockInstance),
    },
  };
});

// Import api AFTER mocks are set up so interceptors are captured
import axios from 'axios';
// Side-effect: importing api registers the interceptors on the mock instance
import api from '../../services/api';

const EXPECTED_BASE_URL = 'https://srv1409601.hstgr.cloud/binny/api/v1';
const STORAGE_KEY_TOKEN = 'binny_auth_token';
const STORAGE_KEY_USER = 'binny_user_data';

describe('API client', () => {
  describe('axios.create configuration', () => {
    it('creates an axios instance with the correct baseURL', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: EXPECTED_BASE_URL })
      );
    });

    it('creates an axios instance with a 30-second timeout', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 30000 })
      );
    });

    it('creates an axios instance with JSON Content-Type header', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });
  });

  describe('request interceptor', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('registers a request interceptor', () => {
      expect(requestInterceptorFulfilled).not.toBeNull();
    });

    it('adds Authorization header when a token exists in SecureStore', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('test-jwt-token');

      const config = { headers: {} as Record<string, string> };
      const result = await requestInterceptorFulfilled!(config);

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(STORAGE_KEY_TOKEN);
      expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
    });

    it('does not add Authorization header when no token is stored', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);

      const config = { headers: {} as Record<string, string> };
      const result = await requestInterceptorFulfilled!(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('returns config unchanged when SecureStore throws', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('SecureStore error'));

      const config = { headers: {} as Record<string, string> };
      // Should not throw — error is swallowed
      const result = await requestInterceptorFulfilled!(config);
      expect(result).toEqual(config);
    });
  });

  describe('response interceptor — success handler', () => {
    it('registers a response interceptor', () => {
      expect(responseInterceptorFulfilled).not.toBeNull();
      expect(responseInterceptorRejected).not.toBeNull();
    });

    it('unwraps { success, data } envelope and returns just data', () => {
      const payload = { id: 1, name: 'Widget' };
      const response = { data: { success: true, data: payload } };

      const result = responseInterceptorFulfilled!(response);

      expect(result.data).toEqual(payload);
    });

    it('unwraps paginated { success, data, pagination } envelope into { data, ...pagination }', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const pagination = { total: 50, page: 1, limit: 10, totalPages: 5 };
      const response = { data: { success: true, data: items, pagination } };

      const result = responseInterceptorFulfilled!(response);

      expect(result.data).toEqual({ data: items, ...pagination });
    });

    it('unwraps paginated { success, data, meta } envelope into { data, ...meta }', () => {
      const items = [{ id: 3 }];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1 };
      const response = { data: { success: true, data: items, meta } };

      const result = responseInterceptorFulfilled!(response);

      expect(result.data).toEqual({ data: items, ...meta });
    });

    it('passes through responses that do not have the success envelope', () => {
      const rawData = { some: 'raw response' };
      const response = { data: rawData };

      const result = responseInterceptorFulfilled!(response);

      expect(result.data).toEqual(rawData);
    });

    it('passes through non-object response data unchanged', () => {
      const response = { data: 'plain string' };

      const result = responseInterceptorFulfilled!(response);

      expect(result.data).toBe('plain string');
    });
  });

  describe('response interceptor — error handler (401)', () => {
    it('clears AUTH_TOKEN from SecureStore on a 401 response', async () => {
      const error = { response: { status: 401 } };

      await expect(responseInterceptorRejected!(error)).rejects.toEqual(error);

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY_TOKEN);
    });

    it('clears USER_DATA from SecureStore on a 401 response', async () => {
      const error = { response: { status: 401 } };

      await expect(responseInterceptorRejected!(error)).rejects.toEqual(error);

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY_USER);
    });

    it('does not call deleteItemAsync for non-401 errors', async () => {
      const error = { response: { status: 500 } };

      await expect(responseInterceptorRejected!(error)).rejects.toEqual(error);

      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('rejects with the original error for 401', async () => {
      const error = { response: { status: 401 } };

      await expect(responseInterceptorRejected!(error)).rejects.toEqual(error);
    });

    it('handles errors with no response object gracefully', async () => {
      const error = { message: 'Network Error' };

      await expect(responseInterceptorRejected!(error)).rejects.toEqual(error);

      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });
  });
});
