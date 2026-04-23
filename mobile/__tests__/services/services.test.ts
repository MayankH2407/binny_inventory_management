/**
 * Integration-level tests for all 9 service modules.
 * Each service is tested to confirm it calls the correct HTTP method
 * and endpoint on the shared `api` axios instance.
 */

import api from '../../services/api';
import { authService } from '../../services/auth.service';
import { childBoxService } from '../../services/childBox.service';
import { masterCartonService } from '../../services/masterCarton.service';
import { customerService } from '../../services/customer.service';
import { dispatchService } from '../../services/dispatch.service';
import { inventoryService } from '../../services/inventory.service';
import { traceService } from '../../services/trace.service';
import { dashboardService } from '../../services/dashboard.service';
import { productService } from '../../services/product.service';

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
const mockPut = api.put as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// authService
// ---------------------------------------------------------------------------
describe('authService', () => {
  describe('login()', () => {
    it('calls POST /auth/login with the provided credentials', async () => {
      const credentials = { email: 'admin@example.com', password: 'pass' };
      const responseData = { user: { id: '1' }, accessToken: 'token' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const result = await authService.login(credentials);

      expect(api.post).toHaveBeenCalledWith('/auth/login', credentials);
      expect(result).toEqual(responseData);
    });

    it('returns the response data from the API', async () => {
      const responseData = { user: { id: '2', username: 'test' }, accessToken: 'abc' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const result = await authService.login({ email: 'admin@example.com', password: '123' });

      expect(result).toEqual(responseData);
    });
  });

  describe('getProfile()', () => {
    it('calls GET /auth/profile', async () => {
      const user = { id: '1', username: 'admin', email: 'a@b.com', role: 'admin' };
      mockGet.mockResolvedValueOnce({ data: user });

      const result = await authService.getProfile();

      expect(api.get).toHaveBeenCalledWith('/auth/profile');
      expect(result).toEqual(user);
    });
  });
});

// ---------------------------------------------------------------------------
// productService
// ---------------------------------------------------------------------------
describe('productService', () => {
  describe('getAll()', () => {
    it('calls GET /products with query params', async () => {
      const params = { page: 1, limit: 20, search: 'shoe' };
      const listData = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      const result = await productService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/products', { params });
      expect(result).toEqual(listData);
    });

    it('calls GET /products without params when called with no arguments', async () => {
      const listData = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      await productService.getAll();

      expect(api.get).toHaveBeenCalledWith('/products', { params: undefined });
    });
  });

  describe('getById()', () => {
    it('calls GET /products/:id', async () => {
      const product = { id: 'prod-1', article_name: 'Slipper X' };
      mockGet.mockResolvedValueOnce({ data: product });

      const result = await productService.getById('prod-1');

      expect(api.get).toHaveBeenCalledWith('/products/prod-1');
      expect(result).toEqual(product);
    });
  });

  describe('getSections()', () => {
    it('calls GET /sections', async () => {
      const sections = [{ id: 's1', name: 'Ladies' }];
      mockGet.mockResolvedValueOnce({ data: sections });

      const result = await productService.getSections();

      expect(api.get).toHaveBeenCalledWith('/sections');
      expect(result).toEqual(sections);
    });
  });
});

// ---------------------------------------------------------------------------
// childBoxService
// ---------------------------------------------------------------------------
describe('childBoxService', () => {
  describe('getAll()', () => {
    it('calls GET /child-boxes with query params', async () => {
      const params = { page: 1, limit: 50, status: 'FREE' };
      const listData = { data: [], total: 0, page: 1, limit: 50, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      const result = await childBoxService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/child-boxes', { params });
      expect(result).toEqual(listData);
    });
  });

  describe('getByBarcode()', () => {
    it('calls GET /child-boxes/qr/:barcode', async () => {
      const barcode = 'CB-0042';
      const childBox = { id: 'cb-1', barcode };
      mockGet.mockResolvedValueOnce({ data: childBox });

      const result = await childBoxService.getByBarcode(barcode);

      expect(api.get).toHaveBeenCalledWith(`/child-boxes/qr/${barcode}`);
      expect(result).toEqual(childBox);
    });
  });

  describe('bulkCreateMultiSize()', () => {
    it('calls POST /child-boxes/bulk-multi-size with the payload', async () => {
      const payload = {
        product_id: 'prod-1',
        sizes: [{ size: '7', quantity: 10 }],
        colour: 'Black',
      };
      const created = [{ id: 'cb-1', barcode: 'CB-001' }];
      mockPost.mockResolvedValueOnce({ data: created });

      const result = await childBoxService.bulkCreateMultiSize(payload as any);

      expect(api.post).toHaveBeenCalledWith('/child-boxes/bulk-multi-size', payload);
      expect(result).toEqual(created);
    });
  });

  describe('getById()', () => {
    it('calls GET /child-boxes/:id', async () => {
      const childBox = { id: 'cb-99', barcode: 'CB-099' };
      mockGet.mockResolvedValueOnce({ data: childBox });

      const result = await childBoxService.getById('cb-99');

      expect(api.get).toHaveBeenCalledWith('/child-boxes/cb-99');
      expect(result).toEqual(childBox);
    });
  });
});

// ---------------------------------------------------------------------------
// masterCartonService
// ---------------------------------------------------------------------------
describe('masterCartonService', () => {
  describe('getAll()', () => {
    it('calls GET /master-cartons with query params', async () => {
      const params = { page: 1, limit: 10, status: 'ACTIVE' };
      const listData = { data: [], total: 0, page: 1, limit: 10, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      const result = await masterCartonService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/master-cartons', { params });
      expect(result).toEqual(listData);
    });
  });

  describe('create()', () => {
    it('calls POST /master-cartons with the payload', async () => {
      const payload = { product_id: 'prod-1', max_capacity: 24 };
      const created = { id: 'mc-1', status: 'CREATED' };
      mockPost.mockResolvedValueOnce({ data: created });

      const result = await masterCartonService.create(payload as any);

      expect(api.post).toHaveBeenCalledWith('/master-cartons', payload);
      expect(result).toEqual(created);
    });
  });

  describe('closeCarton()', () => {
    it('calls POST /master-cartons/:id/close', async () => {
      const carton = { id: 'mc-1', status: 'CLOSED' };
      mockPost.mockResolvedValueOnce({ data: carton });

      const result = await masterCartonService.closeCarton('mc-1');

      expect(api.post).toHaveBeenCalledWith('/master-cartons/mc-1/close');
      expect(result).toEqual(carton);
    });
  });

  describe('fullUnpack()', () => {
    it('calls POST /master-cartons/:id/full-unpack', async () => {
      mockPost.mockResolvedValueOnce({ data: undefined });

      await masterCartonService.fullUnpack('mc-2');

      expect(api.post).toHaveBeenCalledWith('/master-cartons/mc-2/full-unpack');
    });
  });

  describe('getById()', () => {
    it('calls GET /master-cartons/:id', async () => {
      const carton = { id: 'mc-3', status: 'ACTIVE' };
      mockGet.mockResolvedValueOnce({ data: carton });

      const result = await masterCartonService.getById('mc-3');

      expect(api.get).toHaveBeenCalledWith('/master-cartons/mc-3');
      expect(result).toEqual(carton);
    });
  });
});

// ---------------------------------------------------------------------------
// customerService
// ---------------------------------------------------------------------------
describe('customerService', () => {
  describe('getAll()', () => {
    it('calls GET /customers with query params', async () => {
      const params = { page: 1, limit: 25, search: 'raj' };
      const listData = { data: [], total: 0, page: 1, limit: 25, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      const result = await customerService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/customers', { params });
      expect(result).toEqual(listData);
    });
  });

  describe('create()', () => {
    it('calls POST /customers with the payload', async () => {
      const payload = { name: 'New Customer', phone: '9876543210', customer_type: 'DEALER' };
      const created = { id: 'cust-1', ...payload };
      mockPost.mockResolvedValueOnce({ data: created });

      const result = await customerService.create(payload as any);

      expect(api.post).toHaveBeenCalledWith('/customers', payload);
      expect(result).toEqual(created);
    });
  });

  describe('getPrimaryDealers()', () => {
    it('calls GET /customers/primary-dealers', async () => {
      const dealers = [{ id: 'd1', name: 'Dealer A' }];
      mockGet.mockResolvedValueOnce({ data: dealers });

      const result = await customerService.getPrimaryDealers();

      expect(api.get).toHaveBeenCalledWith('/customers/primary-dealers');
      expect(result).toEqual(dealers);
    });
  });

  describe('update()', () => {
    it('calls PUT /customers/:id with the update payload', async () => {
      const updates = { contact_person_mobile: '1234567890' };
      const updated = { id: 'cust-1', name: 'Existing', contact_person_mobile: '1234567890', customer_type: 'DEALER' };
      mockPut.mockResolvedValueOnce({ data: updated });

      const result = await customerService.update('cust-1', updates);

      expect(api.put).toHaveBeenCalledWith('/customers/cust-1', updates);
      expect(result).toEqual(updated);
    });
  });
});

// ---------------------------------------------------------------------------
// dispatchService
// ---------------------------------------------------------------------------
describe('dispatchService', () => {
  describe('getAll()', () => {
    it('calls GET /dispatches with query params', async () => {
      const params = { page: 1, limit: 20, start_date: '2025-01-01' };
      const listData = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      mockGet.mockResolvedValueOnce({ data: listData });

      const result = await dispatchService.getAll(params);

      expect(api.get).toHaveBeenCalledWith('/dispatches', { params });
      expect(result).toEqual(listData);
    });
  });

  describe('create()', () => {
    it('calls POST /dispatches with the payload', async () => {
      const payload = {
        customer_id: 'cust-1',
        vehicle_number: 'MH12AB1234',
        items: [{ child_box_id: 'cb-1' }],
      };
      const created = { id: 'disp-1', status: 'DISPATCHED' };
      mockPost.mockResolvedValueOnce({ data: created });

      const result = await dispatchService.create(payload as any);

      expect(api.post).toHaveBeenCalledWith('/dispatches', payload);
      expect(result).toEqual(created);
    });
  });

  describe('getById()', () => {
    it('calls GET /dispatches/:id', async () => {
      const dispatch = { id: 'disp-99', status: 'DISPATCHED' };
      mockGet.mockResolvedValueOnce({ data: dispatch });

      const result = await dispatchService.getById('disp-99');

      expect(api.get).toHaveBeenCalledWith('/dispatches/disp-99');
      expect(result).toEqual(dispatch);
    });
  });
});

// ---------------------------------------------------------------------------
// inventoryService
// ---------------------------------------------------------------------------
describe('inventoryService', () => {
  describe('getStockSummary()', () => {
    it('calls GET /inventory/stock/summary', async () => {
      const summary = { totalChildBoxes: 500, freeBoxes: 200, packedBoxes: 300 };
      mockGet.mockResolvedValueOnce({ data: summary });

      const result = await inventoryService.getStockSummary();

      expect(api.get).toHaveBeenCalledWith('/inventory/stock/summary');
      expect(result).toEqual(summary);
    });
  });

  describe('getStockHierarchy()', () => {
    it('calls GET /inventory/stock/hierarchy with level param', async () => {
      const params = { level: 'section' as const };
      const hierarchy = [{ section: 'Ladies', totalPairs: 100 }];
      mockGet.mockResolvedValueOnce({ data: hierarchy });

      const result = await inventoryService.getStockHierarchy(params);

      expect(api.get).toHaveBeenCalledWith('/inventory/stock/hierarchy', { params });
      expect(result).toEqual(hierarchy);
    });

    it('calls GET /inventory/stock/hierarchy with nested params', async () => {
      const params = { level: 'colour' as const, section: 'Ladies', article_name: 'Slipper X' };
      const hierarchy = [{ colour: 'Black', totalPairs: 50 }];
      mockGet.mockResolvedValueOnce({ data: hierarchy });

      const result = await inventoryService.getStockHierarchy(params);

      expect(api.get).toHaveBeenCalledWith('/inventory/stock/hierarchy', { params });
      expect(result).toEqual(hierarchy);
    });
  });
});

// ---------------------------------------------------------------------------
// traceService
// ---------------------------------------------------------------------------
describe('traceService', () => {
  describe('traceByBarcode()', () => {
    it('calls GET /inventory/trace/:barcode', async () => {
      const barcode = 'CB-0099';
      const traceResult = { type: 'child_box', barcode, status: 'FREE' };
      mockGet.mockResolvedValueOnce({ data: traceResult });

      const result = await traceService.traceByBarcode(barcode);

      expect(api.get).toHaveBeenCalledWith(`/inventory/trace/${barcode}`);
      expect(result).toEqual(traceResult);
    });

    it('returns the full trace result including nested carton info', async () => {
      const barcode = 'MC-001';
      const traceResult = {
        type: 'master_carton',
        barcode,
        status: 'CLOSED',
        childBoxes: [{ barcode: 'CB-001' }],
      };
      mockGet.mockResolvedValueOnce({ data: traceResult });

      const result = await traceService.traceByBarcode(barcode);

      expect(result).toEqual(traceResult);
    });
  });
});

// ---------------------------------------------------------------------------
// dashboardService
// ---------------------------------------------------------------------------
describe('dashboardService', () => {
  describe('getStats()', () => {
    it('calls GET /dashboard', async () => {
      const stats = {
        totalProducts: 50,
        totalChildBoxes: 1000,
        freeBoxes: 400,
        dispatchedToday: 20,
      };
      mockGet.mockResolvedValueOnce({ data: stats });

      const result = await dashboardService.getStats();

      expect(api.get).toHaveBeenCalledWith('/dashboard');
      expect(result).toEqual(stats);
    });

    it('returns all dashboard stats from the API', async () => {
      const stats = {
        totalProducts: 10,
        totalChildBoxes: 200,
        freeBoxes: 100,
        dispatchedToday: 5,
      };
      mockGet.mockResolvedValueOnce({ data: stats });

      const result = await dashboardService.getStats();

      expect(result).toEqual(stats);
    });
  });
});
