import type {
  CreateDispatchRequest,
  EcommercePoolLookup,
  Foot,
  SampleItem,
} from '../types';

// Shared dispatch-form fields (all optional, trimmed to undefined when blank).
export interface DispatchBaseFields {
  customerId?: string | null;
  destination?: string;
  transportDetails?: string;
  lrNumber?: string;
  vehicleNumber?: string;
  notes?: string;
}

const blank = (v?: string | null): string | undefined => {
  const t = (v ?? '').trim();
  return t ? t : undefined;
};

export function buildBasePayload(f: DispatchBaseFields) {
  return {
    customer_id: f.customerId || undefined,
    destination: blank(f.destination),
    transport_details: blank(f.transportDetails),
    lr_number: blank(f.lrNumber),
    vehicle_number: blank(f.vehicleNumber),
    notes: blank(f.notes),
  };
}

export function buildMasterCartonPayload(
  base: DispatchBaseFields,
  cartonIds: string[]
): CreateDispatchRequest {
  return { ...buildBasePayload(base), master_carton_ids: cartonIds };
}

export interface SampleDispatchFields {
  recipientName?: string;
  purpose?: string;
  referenceDate?: string;
}

/**
 * Ship the checked items out of ONE sample (by mapping_id). A per-item foot
 * override is only sent for BOX items whose chosen foot differs from the
 * stored one. Anything not checked simply stays in the sample.
 */
export function buildSamplePayload(
  base: DispatchBaseFields,
  sampleRecordId: string,
  items: SampleItem[],
  selectedMappingIds: Set<string>,
  footOverrides: Record<string, Foot>,
  fields: SampleDispatchFields
): CreateDispatchRequest {
  const checked = items.filter((i) => selectedMappingIds.has(i.mapping_id));
  return {
    ...buildBasePayload(base),
    sample_dispatch: {
      sample_record_id: sampleRecordId,
      items: checked.map((i) => {
        const override = footOverrides[i.mapping_id];
        return {
          item_type: i.item_type,
          mapping_id: i.mapping_id,
          ...(i.item_type === 'BOX' && override && override !== i.foot ? { foot: override } : {}),
        };
      }),
    },
    sample_recipient_name: blank(fields.recipientName),
    sample_purpose: blank(fields.purpose),
    sample_reference_date: blank(fields.referenceDate),
  };
}

export type EcPoolHit = Extract<EcommercePoolLookup, { in_pool: true }>;

export interface EcommerceDispatchFields {
  referenceName?: string;
  marketplace?: string;
  orderReference?: string;
  listingSku?: string;
  orderDate?: string;
}

export const ecItemKey = (i: { item_type: 'BOX' | 'CARTON'; barcode: string }) =>
  `${i.item_type}:${i.barcode}`;

export function buildEcommercePayload(
  base: DispatchBaseFields,
  items: Array<{ item_type: 'BOX' | 'CARTON'; barcode: string }>,
  fields: EcommerceDispatchFields
): CreateDispatchRequest {
  return {
    ...buildBasePayload(base),
    ecommerce_pool: { items: items.map((i) => ({ item_type: i.item_type, barcode: i.barcode })) },
    reference_name: blank(fields.referenceName),
    marketplace: blank(fields.marketplace),
    order_reference: blank(fields.orderReference),
    listing_sku: blank(fields.listingSku),
    order_date: blank(fields.orderDate),
  };
}
