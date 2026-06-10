import type { ChildBoxWithProduct } from '@/types';

export type Foot = 'PAIR' | 'LEFT' | 'RIGHT';

const footLabel = (f: Foot) => (f === 'PAIR' ? 'pair' : f === 'LEFT' ? 'left foot' : 'right foot');

/**
 * Mirror of the backend foot-availability rule (sample.service.ts `assertFootAvailable`).
 * A box (a pair) can have its LEFT and RIGHT feet sampled independently, so a box already in
 * SAMPLE status is still addable for its OTHER free foot. Boxes consumed by a non-sample flow
 * (PACKED/ECOMMERCE/DISPATCHED) are never addable.
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }`. The backend remains the source of truth;
 * this is a UX pre-check so we can accept/reject a scan without a round-trip surprise.
 */
export function checkFootAvailability(
  box: Pick<ChildBoxWithProduct, 'status' | 'active_sample_feet' | 'barcode'>,
  requestedFoot: Foot
): { ok: true } | { ok: false; reason: string } {
  const status = box.status;
  if (status === 'PACKED' || status === 'ECOMMERCE' || status === 'DISPATCHED') {
    return { ok: false, reason: `Box ${box.barcode} is ${status} — only FREE/GENERATED boxes (or a box with a free foot) can be added` };
  }
  const feet = box.active_sample_feet ?? [];
  if (feet.includes('PAIR')) {
    return { ok: false, reason: `Box ${box.barcode} is already fully in a sample (as a pair)` };
  }
  if (requestedFoot === 'PAIR') {
    if (feet.length > 0) {
      return { ok: false, reason: `Box ${box.barcode} already has its ${feet.join('/').toLowerCase()} foot in a sample — add it as a single foot instead of a pair` };
    }
  } else if (feet.includes(requestedFoot)) {
    return { ok: false, reason: `The ${footLabel(requestedFoot)} of box ${box.barcode} is already in a sample` };
  }
  return { ok: true };
}
