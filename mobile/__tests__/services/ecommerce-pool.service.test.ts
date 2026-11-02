/**
 * E-commerce Area pool (redesign): confirms ecommerceService hits the pool
 * endpoints the backend actually exposes — the old record-scoped
 * create/add-box/scan-carton/remove-box/close/full-unpack calls are gone.
 */

import api from '../../services/api';
import { ecommerceService } from '../../services/ecommerce.service';

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

describe('ecommerceService (pool)', () => {
  it('getPool() calls GET /ecommerce/pool with filters and returns the page', async () => {
    const page = { data: [], total: 0, page: 1, limit: 25, totalPages: 0 };
    mockGet.mockResolvedValueOnce({ data: page });
    const params = { page: 1, limit: 25, search: 'CROWN', item_type: 'BOX' as const };
    const result = await ecommerceService.getPool(params);
    expect(mockGet).toHaveBeenCalledWith('/ecommerce/pool', { params });
    expect(result).toEqual(page);
  });

  it('getPoolSummary() calls GET /ecommerce/pool/summary', async () => {
    const summary = { carton_items: 2, box_items: 5, total_items: 7, total_boxes: 53, total_pairs: 53 };
    mockGet.mockResolvedValueOnce({ data: summary });
    const result = await ecommerceService.getPoolSummary();
    expect(mockGet).toHaveBeenCalledWith('/ecommerce/pool/summary');
    expect(result).toEqual(summary);
  });

  it('lookupPoolItem() URL-encodes the barcode', async () => {
    mockGet.mockResolvedValueOnce({ data: { in_pool: false, reason: 'Not in pool' } });
    await ecommerceService.lookupPoolItem('CB AB/12');
    expect(mockGet).toHaveBeenCalledWith('/ecommerce/pool/lookup/CB%20AB%2F12');
  });

  it('addToPool() calls POST /ecommerce/pool/scan with the barcode', async () => {
    const res = { item_type: 'CARTON', barcode: 'MC123456', boxes_added: 48, mapping_id: 'm1' };
    mockPost.mockResolvedValueOnce({ data: res });
    const result = await ecommerceService.addToPool('MC123456');
    expect(mockPost).toHaveBeenCalledWith('/ecommerce/pool/scan', { barcode: 'MC123456' });
    expect(result).toEqual(res);
  });

  it('removeFromPool() calls POST /ecommerce/pool/remove with item_type + mapping_id', async () => {
    mockPost.mockResolvedValueOnce({ data: { item_type: 'BOX', barcode: 'CB000001' } });
    await ecommerceService.removeFromPool({ item_type: 'BOX', mapping_id: 'm2' });
    expect(mockPost).toHaveBeenCalledWith('/ecommerce/pool/remove', { item_type: 'BOX', mapping_id: 'm2' });
  });

  it('unpackPoolCarton() calls POST /ecommerce/pool/unpack-carton with the mapping_id', async () => {
    const res = { master_carton_id: 'c1', carton_barcode: 'MC123456', boxes_unpacked: 48 };
    mockPost.mockResolvedValueOnce({ data: res });
    const result = await ecommerceService.unpackPoolCarton('m3');
    expect(mockPost).toHaveBeenCalledWith('/ecommerce/pool/unpack-carton', { mapping_id: 'm3' });
    expect(result).toEqual(res);
  });

  it('getStockSummary() calls GET /ecommerce/stock-summary', async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    await ecommerceService.getStockSummary();
    expect(mockGet).toHaveBeenCalledWith('/ecommerce/stock-summary');
  });

  it('no longer exposes the removed record-scoped write flows', () => {
    const svc = ecommerceService as unknown as Record<string, unknown>;
    for (const gone of ['create', 'addBox', 'scanCarton', 'removeBox', 'close', 'fullUnpack']) {
      expect(svc[gone]).toBeUndefined();
    }
  });
});
