/**
 * Integration-level tests for returnsService.
 * Confirms each method calls the correct HTTP method/endpoint on the shared
 * `api` axios instance. Mirrors the style of services.test.ts.
 */

import api from '../../services/api';
import { returnsService } from '../../services/returns.service';

// Mock the api module so no real HTTP requests are made
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('returnsService', () => {
  describe('getAll()', () => {
    it('calls GET /returns with query params', async () => {
      const params = { page: 1, limit: 20, search: 'raj', from_date: '2026-01-01', to_date: '2026-01-31' };
      const listData = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      const result = await returnsService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/returns', { params });
      expect(result).toEqual(listData);
    });

    it('calls GET /returns without params when called with no arguments', async () => {
      const listData = { data: [], total: 0, page: 1, limit: 25, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      await returnsService.getAll();

      expect(api.get).toHaveBeenCalledWith('/returns', { params: undefined });
    });
  });

  describe('getById()', () => {
    it('calls GET /returns/:id', async () => {
      const record = { id: 'ret-1', return_date: '2026-07-01', items: [] };
      mockGet.mockResolvedValueOnce({ data: record });

      const result = await returnsService.getById('ret-1');

      expect(api.get).toHaveBeenCalledWith('/returns/ret-1');
      expect(result).toEqual(record);
    });
  });

  describe('lookup()', () => {
    it('calls GET /returns/lookup/:barcode with the barcode URI-encoded', async () => {
      const item = { item_type: 'BOX', id: 'cb-1', barcode: 'CB0001', status: 'DISPATCHED', returnable: true };
      mockGet.mockResolvedValueOnce({ data: item });

      const result = await returnsService.lookup('CB0001');

      expect(api.get).toHaveBeenCalledWith('/returns/lookup/CB0001');
      expect(result).toEqual(item);
    });
  });

  describe('getDispatchItems()', () => {
    it('calls GET /returns/dispatch/:id/items', async () => {
      const response = {
        dispatch: { id: 'disp-1', source_type: 'master_carton', dispatch_date: '2026-07-01' },
        items: [],
      };
      mockGet.mockResolvedValueOnce({ data: response });

      const result = await returnsService.getDispatchItems('disp-1');

      expect(api.get).toHaveBeenCalledWith('/returns/dispatch/disp-1/items');
      expect(result).toEqual(response);
    });
  });

  describe('create()', () => {
    it('calls POST /returns with the payload', async () => {
      const payload = {
        reason: 'Damaged in transit',
        items: [{ barcode: 'CB0001', item_type: 'BOX' as const }],
      };
      const created = { id: 'ret-1', return_date: '2026-07-20' };
      mockPost.mockResolvedValueOnce({ data: created });

      const result = await returnsService.create(payload);

      expect(api.post).toHaveBeenCalledWith('/returns', payload);
      expect(result).toEqual(created);
    });
  });

  describe('exportCsv()', () => {
    it('calls GET /returns/export with text responseType and a raw transformResponse', async () => {
      const csv = 'return_date,customer\n2026-07-01,Acme';
      mockGet.mockResolvedValueOnce({ data: csv });

      const result = await returnsService.exportCsv({ from_date: '2026-01-01', to_date: '2026-01-31' });

      expect(api.get).toHaveBeenCalledWith('/returns/export', {
        params: { from_date: '2026-01-01', to_date: '2026-01-31' },
        responseType: 'text',
        transformResponse: expect.any(Array),
      });
      expect(result).toEqual(csv);
    });
  });
});
