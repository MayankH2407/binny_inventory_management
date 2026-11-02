/**
 * Repack = fullUnpack + packByBarcode (same as the web's Unpack & Repack page).
 * The old source→destination /master-cartons/repack endpoint was removed from the
 * backend, so masterCartonService must not expose or call it any more.
 */

import api from '../../services/api';
import { masterCartonService } from '../../services/masterCarton.service';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockPost = api.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('masterCartonService (repack flow)', () => {
  it('packByBarcode() POSTs /master-cartons/pack-by-barcode and returns the result', async () => {
    const result = { carton: null, alreadyPacked: true, childBoxBarcode: 'CBHK0Q9J' };
    mockPost.mockResolvedValueOnce({ data: result });

    const out = await masterCartonService.packByBarcode({ barcode: 'CBHK0Q9J', master_carton_id: 'c1' });

    expect(mockPost).toHaveBeenCalledWith('/master-cartons/pack-by-barcode', {
      barcode: 'CBHK0Q9J',
      master_carton_id: 'c1',
    });
    expect(out).toEqual(result);
  });

  it('fullUnpack() POSTs /master-cartons/:id/full-unpack', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });
    await masterCartonService.fullUnpack('c1');
    expect(mockPost).toHaveBeenCalledWith('/master-cartons/c1/full-unpack');
  });

  it('no longer exposes the removed repack() transfer', () => {
    expect((masterCartonService as Record<string, unknown>).repack).toBeUndefined();
  });
});
