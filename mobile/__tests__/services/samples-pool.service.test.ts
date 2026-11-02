/**
 * Samples pool API (redesign 2026-09, mirrors the web sample.service.ts).
 * Confirms samplesService hits the pool endpoints — the old add-box /
 * scan-carton / remove-box / close / full-unpack endpoints no longer exist.
 */

import api from '../../services/api';
import { samplesService } from '../../services/samples.service';

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
const mockDelete = api.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('samplesService (pool)', () => {
  describe('getAll()', () => {
    it('passes the derived state filter through as `state`', async () => {
      const responseData = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: responseData });

      const params = { page: 1, limit: 20, state: 'OPEN' as const, search: 'SR12' };
      const result = await samplesService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/samples', { params });
      expect(result).toEqual(responseData);
    });
  });

  describe('getSummary()', () => {
    it('calls GET /samples/summary', async () => {
      const responseData = { total_records: 3, empty_records: 1, open_records: 1, dispatched_records: 1, open_items: 4, open_boxes: 9 };
      mockGet.mockResolvedValueOnce({ data: responseData });

      expect(await samplesService.getSummary()).toEqual(responseData);
      expect(api.get).toHaveBeenCalledWith('/samples/summary');
    });
  });

  describe('create()', () => {
    it('mints an empty record with POST /samples (no body required)', async () => {
      mockPost.mockResolvedValueOnce({ data: { id: 's1', sample_barcode: 'SR123456' } });

      const result = await samplesService.create();

      expect(api.post).toHaveBeenCalledWith('/samples', {});
      expect(result).toEqual({ id: 's1', sample_barcode: 'SR123456' });
    });
  });

  describe('getContents()', () => {
    it('calls GET /samples/:id/contents', async () => {
      const responseData = [{ item_type: 'BOX', mapping_id: 'm1', barcode: 'CB000001', foot: 'PAIR' }];
      mockGet.mockResolvedValueOnce({ data: responseData });

      const result = await samplesService.getContents('s1');

      expect(api.get).toHaveBeenCalledWith('/samples/s1/contents');
      expect(result).toEqual(responseData);
    });
  });

  describe('scan()', () => {
    it('posts the barcode and foot to POST /samples/:id/scan', async () => {
      const responseData = { item_type: 'BOX', barcode: 'CB000001', boxes_added: 1, mapping_id: 'm1', foot: 'LEFT' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const result = await samplesService.scan('s1', { barcode: 'CB000001', foot: 'LEFT' });

      expect(api.post).toHaveBeenCalledWith('/samples/s1/scan', { barcode: 'CB000001', foot: 'LEFT' });
      expect(result).toEqual(responseData);
    });
  });

  describe('unpackCarton()', () => {
    it('posts the mapping_id to POST /samples/:id/unpack-carton', async () => {
      const responseData = { master_carton_id: 'mc1', carton_barcode: 'MC123456', boxes_unpacked: 6 };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const result = await samplesService.unpackCarton('s1', 'm9');

      expect(api.post).toHaveBeenCalledWith('/samples/s1/unpack-carton', { mapping_id: 'm9' });
      expect(result).toEqual(responseData);
    });
  });

  describe('setFoot()', () => {
    it('posts mapping_id + foot to POST /samples/:id/set-foot', async () => {
      const responseData = { mapping_id: 'm1', barcode: 'CB000001', foot: 'RIGHT' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const vars = { mapping_id: 'm1', foot: 'RIGHT' as const };
      const result = await samplesService.setFoot('s1', vars);

      expect(api.post).toHaveBeenCalledWith('/samples/s1/set-foot', vars);
      expect(result).toEqual(responseData);
    });
  });

  describe('remove()', () => {
    it('posts item_type + mapping_id to POST /samples/:id/remove', async () => {
      mockPost.mockResolvedValueOnce({ data: { item_type: 'CARTON', barcode: 'MC123456' } });

      const vars = { item_type: 'CARTON' as const, mapping_id: 'm2' };
      await samplesService.remove('s1', vars);

      expect(api.post).toHaveBeenCalledWith('/samples/s1/remove', vars);
    });
  });

  describe('clear()', () => {
    it('calls POST /samples/:id/clear and returns the release counts', async () => {
      const responseData = { released_boxes: 5, released_cartons: 1 };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const result = await samplesService.clear('s1');

      expect(api.post).toHaveBeenCalledWith('/samples/s1/clear');
      expect(result).toEqual(responseData);
    });
  });

  describe('delete()', () => {
    it('calls DELETE /samples/:id', async () => {
      mockDelete.mockResolvedValueOnce({ data: undefined });

      await samplesService.delete('s1');

      expect(api.delete).toHaveBeenCalledWith('/samples/s1');
    });
  });
});
