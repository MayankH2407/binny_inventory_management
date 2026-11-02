import {
  buildMasterCartonPayload,
  buildSamplePayload,
  buildEcommercePayload,
  ecItemKey,
} from '../../utils/dispatchPayload';
import type { SampleItem } from '../../types';

const item = (over: Partial<SampleItem>): SampleItem => ({
  item_type: 'BOX',
  mapping_id: 'm1',
  barcode: 'CBAAAAAA',
  child_box_id: 'c1',
  master_carton_id: null,
  foot: 'PAIR',
  box_count: 1,
  pairs: 1,
  article_summary: null,
  colour_summary: null,
  size_summary: null,
  mrp: null,
  source_carton_barcode: null,
  added_at: '2026-10-01T00:00:00Z',
  added_by_name: null,
  ...over,
});

describe('dispatch payload builders', () => {
  const base = { customerId: 'cust-1', destination: ' Mumbai ', notes: '   ' };

  it('master carton: sends only master_carton_ids, trims blanks', () => {
    const p = buildMasterCartonPayload(base, ['a', 'b']);
    expect(p).toMatchObject({ customer_id: 'cust-1', destination: 'Mumbai', master_carton_ids: ['a', 'b'] });
    expect(p.notes).toBeUndefined();
    expect(p).not.toHaveProperty('sample_dispatch');
    expect(p).not.toHaveProperty('ecommerce_pool');
  });

  it('sample: only checked items, uses mapping_id, never the old sample_record_id field', () => {
    const items = [
      item({ mapping_id: 'm1' }),
      item({ mapping_id: 'm2', foot: 'LEFT' }),
      item({ mapping_id: 'm3', item_type: 'CARTON', child_box_id: null, master_carton_id: 'mc', foot: 'PAIR' }),
    ];
    const p = buildSamplePayload(
      base, 'rec-1', items, new Set(['m2', 'm3']), { m2: 'RIGHT', m3: 'LEFT' },
      { recipientName: ' Ravi ', purpose: '', referenceDate: '2026-10-20' }
    );
    expect(p.sample_dispatch).toEqual({
      sample_record_id: 'rec-1',
      items: [
        { item_type: 'BOX', mapping_id: 'm2', foot: 'RIGHT' }, // override differs
        { item_type: 'CARTON', mapping_id: 'm3' },               // foot never sent for cartons
      ],
    });
    expect(p.sample_recipient_name).toBe('Ravi');
    expect(p.sample_purpose).toBeUndefined();
    expect(p.sample_reference_date).toBe('2026-10-20');
    expect(p).not.toHaveProperty('sample_record_id');
  });

  it('sample: foot override equal to the stored foot is not sent', () => {
    const p = buildSamplePayload(base, 'r', [item({ mapping_id: 'm1', foot: 'LEFT' })], new Set(['m1']), { m1: 'LEFT' }, {});
    expect(p.sample_dispatch!.items[0]).toEqual({ item_type: 'BOX', mapping_id: 'm1' });
  });

  it('ecommerce: posts ecommerce_pool items + details, never ecommerce_record_id', () => {
    const p = buildEcommercePayload(
      base,
      [{ item_type: 'BOX', barcode: 'CB1' }, { item_type: 'CARTON', barcode: 'MC1' }],
      { marketplace: 'Amazon', orderReference: ' 123 ', referenceName: '' }
    );
    expect(p.ecommerce_pool).toEqual({
      items: [{ item_type: 'BOX', barcode: 'CB1' }, { item_type: 'CARTON', barcode: 'MC1' }],
    });
    expect(p.marketplace).toBe('Amazon');
    expect(p.order_reference).toBe('123');
    expect(p.reference_name).toBeUndefined();
    expect(p).not.toHaveProperty('ecommerce_record_id');
  });

  it('ecItemKey distinguishes a box from a carton with the same text', () => {
    expect(ecItemKey({ item_type: 'BOX', barcode: 'X' })).not.toBe(ecItemKey({ item_type: 'CARTON', barcode: 'X' }));
  });
});
