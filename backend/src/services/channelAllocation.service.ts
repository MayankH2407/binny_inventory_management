import type { PoolClient } from 'pg';
import { BadRequestError, NotFoundError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Shared between sample.service.ts and ecommerce.service.ts. Extracted out of
// sample.service.ts (which ecommerce.service.ts used to import
// assertCartonAllocatable from) because the Samples redesign needs
// resolvePoolBarcode too, which would have made the two services import from
// each other.
// ---------------------------------------------------------------------------

type QueryExecutor = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

// ---------------------------------------------------------------------------
// resolveChannelBarcode — identifies a scanned barcode as a sample record
// (only when includeSampleRecords is set — dispatch/detail lookups that are
// scoped to one sample never want this), a master carton, or a child box,
// purely by DB lookup. NEVER branch on barcode prefix — legacy
// `BINNY-CB-{uuid}` child box codes exist alongside the current short-format
// ones, so prefix sniffing would misclassify them.
// ---------------------------------------------------------------------------
export async function resolveChannelBarcode(
  exec: QueryExecutor,
  barcode: string,
  options: { includeSampleRecords?: boolean } = {}
): Promise<{ item_type: 'SAMPLE_RECORD' | 'BOX' | 'CARTON'; id: string; barcode: string }> {
  const upper = barcode.trim().toUpperCase();

  if (options.includeSampleRecords) {
    const srResult = await exec.query(
      'SELECT id, sample_barcode FROM sample_records WHERE sample_barcode = UPPER($1)',
      [upper]
    );
    if (srResult.rows.length > 0) {
      return { item_type: 'SAMPLE_RECORD', id: srResult.rows[0].id, barcode: srResult.rows[0].sample_barcode };
    }
  }

  const mcResult = await exec.query(
    'SELECT id, carton_barcode FROM master_cartons WHERE carton_barcode = UPPER($1)',
    [upper]
  );
  if (mcResult.rows.length > 0) {
    return { item_type: 'CARTON', id: mcResult.rows[0].id, barcode: mcResult.rows[0].carton_barcode };
  }

  const cbResult = await exec.query(
    `SELECT cb.id, cb.barcode FROM child_boxes cb JOIN products p ON p.id = cb.product_id WHERE cb.barcode = UPPER($1)`,
    [upper]
  );
  if (cbResult.rows.length > 0) {
    return { item_type: 'BOX', id: cbResult.rows[0].id, barcode: cbResult.rows[0].barcode };
  }

  throw new NotFoundError(`No sample, child box, or master carton found with barcode ${upper}`);
}

// ---------------------------------------------------------------------------
// Carton-membership (whole-carton scan-in) — a master carton can be added
// INTACT to a sample or e-commerce record: its boxes stay PACKED and its
// carton_child_mapping rows stay active. Only sample_carton_mapping /
// ecommerce_carton_mapping records the allocation. A carton may be actively
// allocated to at most one such record at a time.
//
// `AND dispatch_record_id IS NULL` on both EXISTS checks is load-bearing post
// the pool redesigns: a shipped mapping row stays is_active=true (kept for
// history), so without this filter a carton that already shipped through
// samples or e-commerce would be permanently un-allocatable — this was a
// real, pre-existing latent bug on the e-commerce side (masked only because
// a dispatched carton's own status check already rejected it earlier),
// closed here for both channels at once.
// ---------------------------------------------------------------------------
export async function assertCartonAllocatable(
  client: PoolClient,
  cartonId: string,
  cartonBarcode: string
): Promise<void> {
  const result = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM sample_carton_mapping
                WHERE master_carton_id = $1 AND is_active = true AND dispatch_record_id IS NULL) AS sample_hit,
       EXISTS (SELECT 1 FROM ecommerce_carton_mapping
                WHERE master_carton_id = $1 AND is_active = true AND dispatch_record_id IS NULL) AS ecommerce_hit`,
    [cartonId]
  );
  const { sample_hit, ecommerce_hit } = result.rows[0];
  if (sample_hit || ecommerce_hit) {
    throw new BadRequestError(
      `Master carton ${cartonBarcode} is already allocated to another sample/e-commerce record`
    );
  }
}
