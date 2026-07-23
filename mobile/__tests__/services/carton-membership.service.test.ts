/**
 * Carton-level membership in Samples & E-commerce (mirrors the web feature
 * shipped 2026-07-16). Confirms samplesService/ecommerceService scanCarton()
 * and getCartons() hit the correct endpoints.
 */

import api from '../../services/api';
import { samplesService } from '../../services/samples.service';
import { ecommerceService } from '../../services/ecommerce.service';

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

// ---------------------------------------------------------------------------
// samplesService — carton membership
// ---------------------------------------------------------------------------
describe('samplesService (carton membership)', () => {
  describe('scanCarton()', () => {
    it('calls POST /samples/scan-carton with the sample_record_id and carton_barcode', async () => {
      const responseData = { added: 6, cartonBarcode: 'MC123456' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const vars = { sample_record_id: 'sample-1', carton_barcode: 'MC123456' };
      const result = await samplesService.scanCarton(vars);

      expect(api.post).toHaveBeenCalledWith('/samples/scan-carton', vars);
      expect(result).toEqual(responseData);
    });
  });

  describe('getCartons()', () => {
    it('calls GET /samples/:id/cartons and returns the carton list', async () => {
      const responseData = [
        { id: 'm1', master_carton_id: 'mc1', carton_barcode: 'MC123456', child_count: 6 },
      ];
      mockGet.mockResolvedValueOnce({ data: responseData });

      const result = await samplesService.getCartons('sample-1');

      expect(api.get).toHaveBeenCalledWith('/samples/sample-1/cartons');
      expect(result).toEqual(responseData);
    });
  });

  describe('create() with carton_barcodes', () => {
    it('passes carton_barcodes through to POST /samples alongside child_box_barcodes', async () => {
      const responseData = { id: 'sample-1' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const payload = {
        name: 'Spring Exhibition',
        child_box_barcodes: ['CB000001'],
        carton_barcodes: ['MC123456'],
      };
      const result = await samplesService.create(payload);

      expect(api.post).toHaveBeenCalledWith('/samples', payload);
      expect(result).toEqual(responseData);
    });
  });
});

// ---------------------------------------------------------------------------
// ecommerceService — carton membership
// ---------------------------------------------------------------------------
describe('ecommerceService (carton membership)', () => {
  describe('scanCarton()', () => {
    it('calls POST /ecommerce/scan-carton with the ecommerce_record_id and carton_barcode', async () => {
      const responseData = { added: 4, cartonBarcode: 'MC654321' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const vars = { ecommerce_record_id: 'ecom-1', carton_barcode: 'MC654321' };
      const result = await ecommerceService.scanCarton(vars);

      expect(api.post).toHaveBeenCalledWith('/ecommerce/scan-carton', vars);
      expect(result).toEqual(responseData);
    });
  });

  describe('getCartons()', () => {
    it('calls GET /ecommerce/:id/cartons and returns the carton list', async () => {
      const responseData = [
        { id: 'm2', master_carton_id: 'mc2', carton_barcode: 'MC654321', child_count: 4 },
      ];
      mockGet.mockResolvedValueOnce({ data: responseData });

      const result = await ecommerceService.getCartons('ecom-1');

      expect(api.get).toHaveBeenCalledWith('/ecommerce/ecom-1/cartons');
      expect(result).toEqual(responseData);
    });
  });

  describe('create() with carton_barcodes', () => {
    it('passes carton_barcodes through to POST /ecommerce alongside child_box_barcodes', async () => {
      const responseData = { id: 'ecom-1' };
      mockPost.mockResolvedValueOnce({ data: responseData });

      const payload = {
        name: 'Amazon Spring Sale',
        child_box_barcodes: ['CB000002'],
        carton_barcodes: ['MC654321'],
      };
      const result = await ecommerceService.create(payload);

      expect(api.post).toHaveBeenCalledWith('/ecommerce', payload);
      expect(result).toEqual(responseData);
    });
  });
});
