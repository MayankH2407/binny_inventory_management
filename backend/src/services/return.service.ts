import { query, getClient } from '../config/database';
import { ReturnRecord } from '../types';
import { CHILD_BOX_STATUS, MASTER_CARTON_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateReturnInput } from '../models/schemas/return.schema';
import { logger } from '../utils/logger';

interface ProductSummary {
  article_summary: string | null;
  colour_summary: string | null;
  size_summary: string | null;
  box_count: number;
  pairs: number;
  mrp: number | null;
}

interface OriginDispatchInfo {
  id: string;
  dispatch_date: string;
  customer_firm_name: string | null;
  source_label: string;
}

interface LookupResult {
  item_type: 'BOX' | 'CARTON';
  id: string;
  barcode: string;
  status: string;
  returnable: boolean;
  reason?: string;
  channel?: 'carton' | 'ecommerce' | 'sample' | 'loose';
  child_count?: number;
  product_summary?: ProductSummary;
  article_name?: string;
  colour?: string;
  size?: string;
  mrp?: number;
  hsn_code?: string | null;
  section?: string | null;
  origin_dispatch?: OriginDispatchInfo | null;
}

interface DispatchReturnableItem {
  item_type: 'BOX' | 'CARTON';
  id: string;
  barcode: string;
  status: string;
  returnable: boolean;
  reason?: string;
  child_count?: number;
  product_summary?: ProductSummary;
  article_name?: string;
  colour?: string;
  size?: string;
  mrp?: number;
  returned?: boolean;
  returned_at?: string | null;
}

async function getCartonProductSummary(client: { query: typeof query }, cartonId: string): Promise<ProductSummary> {
  const summaryResult = await client.query(
    `SELECT
       string_agg(DISTINCT p.article_name, ', ') as article_summary,
       string_agg(DISTINCT p.colour, ', ') as colour_summary,
       string_agg(DISTINCT p.size, ', ') as size_summary,
       COUNT(DISTINCT cb.id) as box_count,
       COALESCE(SUM(cb.quantity), 0) as pairs,
       MIN(p.mrp) as mrp
     FROM carton_child_mapping ccm
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ccm.master_carton_id = $1 AND ccm.is_active = true`,
    [cartonId]
  );
  const s = summaryResult.rows[0];
  return {
    article_summary: s.article_summary,
    colour_summary: s.colour_summary,
    size_summary: s.size_summary,
    box_count: parseInt(s.box_count, 10),
    pairs: parseInt(s.pairs, 10),
    mrp: s.mrp !== null ? Number(s.mrp) : null,
  };
}

/**
 * Resolve the origin dispatch a returnable item came from, so a return entry
 * records where each item was shipped from — even in blind scan-in (where the
 * return itself isn't tied to a single dispatch). For a BOX this must be called
 * BEFORE its active mappings are deactivated. Returns null if not determinable.
 */
async function resolveOriginDispatchId(
  client: { query: typeof query },
  itemType: 'BOX' | 'CARTON',
  entityId: string
): Promise<string | null> {
  const latestForCarton = async (cartonId: string): Promise<string | null> => {
    const r = await client.query(
      `SELECT id FROM dispatch_records WHERE master_carton_id = $1
       ORDER BY dispatch_date DESC, created_at DESC LIMIT 1`,
      [cartonId]
    );
    return r.rows[0]?.id ?? null;
  };

  if (itemType === 'CARTON') {
    return latestForCarton(entityId);
  }

  // BOX: prefer the active carton mapping's carton dispatch, else the active
  // e-commerce mapping's dispatch.
  const cartonMap = await client.query(
    `SELECT master_carton_id FROM carton_child_mapping WHERE child_box_id = $1 AND is_active = true LIMIT 1`,
    [entityId]
  );
  if (cartonMap.rows[0]) {
    const id = await latestForCarton(cartonMap.rows[0].master_carton_id);
    if (id) return id;
  }
  const ecomMap = await client.query(
    `SELECT ecommerce_record_id FROM ecommerce_box_mapping WHERE child_box_id = $1 AND is_active = true LIMIT 1`,
    [entityId]
  );
  if (ecomMap.rows[0]) {
    const r = await client.query(
      `SELECT id FROM dispatch_records WHERE ecommerce_record_id = $1
       ORDER BY dispatch_date DESC, created_at DESC LIMIT 1`,
      [ecomMap.rows[0].ecommerce_record_id]
    );
    if (r.rows[0]) return r.rows[0].id;
  }
  return null;
}

/**
 * Read-only helper for blind-scan validation: does the barcode identify a
 * returnable master carton or child box? Mirrors the dispatch lookup style.
 */
export async function lookupReturnable(barcode: string): Promise<LookupResult> {
  const upperBarcode = barcode.toUpperCase();

  // Try carton first
  const cartonResult = await query('SELECT * FROM master_cartons WHERE carton_barcode = UPPER($1)', [upperBarcode]);
  if (cartonResult.rows.length > 0) {
    const carton = cartonResult.rows[0];
    const returnable = carton.status === MASTER_CARTON_STATUS.DISPATCHED;
    const reason = returnable
      ? undefined
      : `Carton status is ${carton.status}; only DISPATCHED cartons can be returned`;

    const productSummary = await getCartonProductSummary({ query }, carton.id);

    const originResult = await query(
      `SELECT dr.id, dr.dispatch_date, c.firm_name AS customer_firm_name
       FROM dispatch_records dr
       LEFT JOIN customers c ON c.id = dr.customer_id
       WHERE dr.master_carton_id = $1
       ORDER BY dr.dispatch_date DESC, dr.created_at DESC
       LIMIT 1`,
      [carton.id]
    );
    const originRow = originResult.rows[0];
    const originDispatch: OriginDispatchInfo | null = originRow
      ? {
          id: originRow.id,
          dispatch_date: originRow.dispatch_date,
          customer_firm_name: originRow.customer_firm_name,
          source_label: carton.carton_barcode,
        }
      : null;

    return {
      item_type: 'CARTON',
      id: carton.id,
      barcode: carton.carton_barcode,
      status: carton.status,
      child_count: carton.child_count,
      returnable,
      reason,
      product_summary: productSummary,
      origin_dispatch: originDispatch,
    };
  }

  // Try box
  const boxResult = await query(
    `SELECT cb.*, p.article_name, p.colour, p.size, p.mrp, p.hsn_code, p.section
     FROM child_boxes cb JOIN products p ON p.id = cb.product_id
     WHERE cb.barcode = UPPER($1)`,
    [upperBarcode]
  );
  if (boxResult.rows.length > 0) {
    const box = boxResult.rows[0];
    let returnable = box.status === CHILD_BOX_STATUS.DISPATCHED;
    let reason = returnable
      ? undefined
      : `Box status is ${box.status}; only DISPATCHED boxes can be returned`;
    let channel: 'carton' | 'ecommerce' | 'sample' | 'loose' = 'loose';
    let originDispatch: OriginDispatchInfo | null = null;

    const cartonMapResult = await query(
      `SELECT ccm.master_carton_id, mc.carton_barcode FROM carton_child_mapping ccm
       JOIN master_cartons mc ON mc.id = ccm.master_carton_id
       WHERE ccm.child_box_id = $1 AND ccm.is_active = true`,
      [box.id]
    );

    if (cartonMapResult.rows.length > 0) {
      channel = 'carton';
      const { master_carton_id: cartonId, carton_barcode: cartonBarcode } = cartonMapResult.rows[0];
      const originResult = await query(
        `SELECT dr.id, dr.dispatch_date, c.firm_name AS customer_firm_name
         FROM dispatch_records dr
         LEFT JOIN customers c ON c.id = dr.customer_id
         WHERE dr.master_carton_id = $1
         ORDER BY dr.dispatch_date DESC, dr.created_at DESC
         LIMIT 1`,
        [cartonId]
      );
      const originRow = originResult.rows[0];
      originDispatch = originRow
        ? {
            id: originRow.id,
            dispatch_date: originRow.dispatch_date,
            customer_firm_name: originRow.customer_firm_name,
            source_label: cartonBarcode,
          }
        : null;
    } else {
      const ecomMapResult = await query(
        `SELECT ebm.ecommerce_record_id, er.ecommerce_barcode FROM ecommerce_box_mapping ebm
         JOIN ecommerce_records er ON er.id = ebm.ecommerce_record_id
         WHERE ebm.child_box_id = $1 AND ebm.is_active = true`,
        [box.id]
      );

      if (ecomMapResult.rows.length > 0) {
        channel = 'ecommerce';
        const { ecommerce_record_id: ecomId, ecommerce_barcode: ecomBarcode } = ecomMapResult.rows[0];
        const originResult = await query(
          `SELECT dr.id, dr.dispatch_date, c.firm_name AS customer_firm_name
           FROM dispatch_records dr
           LEFT JOIN customers c ON c.id = dr.customer_id
           WHERE dr.ecommerce_record_id = $1
           ORDER BY dr.dispatch_date DESC, dr.created_at DESC
           LIMIT 1`,
          [ecomId]
        );
        const originRow = originResult.rows[0];
        originDispatch = originRow
          ? {
              id: originRow.id,
              dispatch_date: originRow.dispatch_date,
              customer_firm_name: originRow.customer_firm_name,
              source_label: ecomBarcode,
            }
          : null;
      } else {
        const sampleMapResult = await query(
          `SELECT 1 FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true`,
          [box.id]
        );
        if (sampleMapResult.rows.length > 0) {
          channel = 'sample';
          returnable = false;
          reason = 'Sample returns are not supported';
        }
      }
    }

    return {
      item_type: 'BOX',
      id: box.id,
      barcode: box.barcode,
      status: box.status,
      returnable,
      reason,
      channel,
      article_name: box.article_name,
      colour: box.colour,
      size: box.size,
      mrp: box.mrp !== null ? Number(box.mrp) : undefined,
      hsn_code: box.hsn_code,
      section: box.section,
      origin_dispatch: originDispatch,
    };
  }

  throw new NotFoundError('No child box or carton found for that barcode');
}

/**
 * For "Against a dispatch" capture mode: the returnable items belonging to a
 * given dispatch record (master-carton or e-commerce sourced only — samples
 * are rejected here since they are out of scope for returns).
 */
export async function getDispatchReturnableItems(dispatchRecordId: string): Promise<{
  dispatch: {
    id: string;
    source_type: string | null;
    source_label: string | null;
    customer_firm_name: string | null;
    dispatch_date: string;
  };
  items: DispatchReturnableItem[];
}> {
  const drResult = await query(
    `SELECT dr.*,
       mc.carton_barcode, sr.sample_barcode, er.ecommerce_barcode,
       CASE
         WHEN dr.master_carton_id IS NOT NULL THEN 'master_carton'
         WHEN dr.sample_record_id IS NOT NULL THEN 'sample'
         WHEN dr.ecommerce_record_id IS NOT NULL THEN 'ecommerce'
       END as source_type,
       COALESCE(mc.carton_barcode, sr.sample_barcode, er.ecommerce_barcode) as source_label,
       c.firm_name AS customer_firm_name
     FROM dispatch_records dr
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN sample_records sr ON sr.id = dr.sample_record_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = dr.customer_id
     WHERE dr.id = $1`,
    [dispatchRecordId]
  );
  if (drResult.rows.length === 0) {
    throw new NotFoundError('Dispatch record not found');
  }
  const dr = drResult.rows[0];

  if (dr.sample_record_id) {
    throw new BadRequestError('Sample dispatches cannot be returned');
  }

  // Single lookup keyed by this dispatch: which boxes/cartons already have a
  // return_items row tied to this dispatch, and when the return was recorded.
  const returnLookupResult = await query(
    `SELECT ri.child_box_id, ri.master_carton_id,
       MAX(COALESCE(rr.return_date, rr.created_at)) AS returned_at
     FROM return_items ri
     JOIN return_records rr ON rr.id = ri.return_record_id
     WHERE ri.dispatch_record_id = $1
     GROUP BY ri.child_box_id, ri.master_carton_id`,
    [dispatchRecordId]
  );
  const returnedBoxMap = new Map<string, string | null>();
  const returnedCartonMap = new Map<string, string | null>();
  for (const row of returnLookupResult.rows) {
    if (row.child_box_id) returnedBoxMap.set(row.child_box_id, row.returned_at);
    if (row.master_carton_id) returnedCartonMap.set(row.master_carton_id, row.returned_at);
  }

  const items: DispatchReturnableItem[] = [];

  if (dr.master_carton_id) {
    const cartonResult = await query('SELECT * FROM master_cartons WHERE id = $1', [dr.master_carton_id]);
    const carton = cartonResult.rows[0];
    const returnable = carton.status === MASTER_CARTON_STATUS.DISPATCHED;
    const returned = !returnable || returnedCartonMap.has(carton.id);
    items.push({
      item_type: 'CARTON',
      id: carton.id,
      barcode: carton.carton_barcode,
      status: carton.status,
      returnable,
      reason: returnable ? undefined : `Carton status is ${carton.status}; only DISPATCHED cartons can be returned`,
      child_count: carton.child_count,
      product_summary: await getCartonProductSummary({ query }, carton.id),
      returned,
      returned_at: returnedCartonMap.get(carton.id) ?? null,
    });
  }

  if (dr.ecommerce_record_id) {
    const boxesResult = await query(
      `SELECT cb.*, p.article_name, p.colour, p.size, p.mrp
       FROM ecommerce_box_mapping ebm
       JOIN child_boxes cb ON cb.id = ebm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true`,
      [dr.ecommerce_record_id]
    );
    for (const box of boxesResult.rows) {
      const returnable = box.status === CHILD_BOX_STATUS.DISPATCHED;
      items.push({
        item_type: 'BOX',
        id: box.id,
        barcode: box.barcode,
        status: box.status,
        returnable,
        reason: returnable ? undefined : `Box status is ${box.status}; only DISPATCHED boxes can be returned`,
        article_name: box.article_name,
        colour: box.colour,
        size: box.size,
        mrp: box.mrp !== null ? Number(box.mrp) : undefined,
        returned: returnedBoxMap.has(box.id),
        returned_at: returnedBoxMap.get(box.id) ?? null,
      });
    }

    const cartonsResult = await query(
      `SELECT mc.* FROM ecommerce_carton_mapping ecm
       JOIN master_cartons mc ON mc.id = ecm.master_carton_id
       WHERE ecm.ecommerce_record_id = $1 AND ecm.is_active = true`,
      [dr.ecommerce_record_id]
    );
    for (const carton of cartonsResult.rows) {
      const returnable = carton.status === MASTER_CARTON_STATUS.DISPATCHED;
      const returned = !returnable || returnedCartonMap.has(carton.id);
      items.push({
        item_type: 'CARTON',
        id: carton.id,
        barcode: carton.carton_barcode,
        status: carton.status,
        returnable,
        reason: returnable ? undefined : `Carton status is ${carton.status}; only DISPATCHED cartons can be returned`,
        child_count: carton.child_count,
        product_summary: await getCartonProductSummary({ query }, carton.id),
        returned,
        returned_at: returnedCartonMap.get(carton.id) ?? null,
      });
    }
  }

  return {
    dispatch: {
      id: dr.id,
      source_type: dr.source_type,
      source_label: dr.source_label,
      customer_firm_name: dr.customer_firm_name,
      dispatch_date: dr.dispatch_date,
    },
    items,
  };
}

export async function createReturn(
  input: CreateReturnInput,
  returnedBy: string
): Promise<ReturnRecord & { items: unknown[] }> {
  // Dedupe items by UPPER(barcode) — collapse duplicate scans in one payload
  const dedupedItemsByBarcode = new Map<string, { barcode: string; item_type: 'BOX' | 'CARTON' }>();
  for (const item of input.items) {
    const key = item.barcode.toUpperCase();
    if (!dedupedItemsByBarcode.has(key)) {
      dedupedItemsByBarcode.set(key, { barcode: key, item_type: item.item_type });
    }
  }
  const dedupedItems = Array.from(dedupedItemsByBarcode.values());

  const client = await getClient();
  let returnRecordId: string;
  let itemCount = 0;
  let boxCount = 0;

  try {
    await client.query('BEGIN');

    if (input.dispatch_record_id) {
      const drResult = await client.query('SELECT id FROM dispatch_records WHERE id = $1', [
        input.dispatch_record_id,
      ]);
      if (drResult.rows.length === 0) {
        throw new NotFoundError('Dispatch record not found');
      }
    }

    const returnDate = input.return_date ? new Date(input.return_date) : new Date();

    const returnRecordResult = await client.query(
      `INSERT INTO return_records (dispatch_record_id, customer_id, returned_by, return_date, reason, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.dispatch_record_id || null,
        input.customer_id || null,
        returnedBy,
        returnDate,
        input.reason || null,
        input.notes || null,
        JSON.stringify({}),
      ]
    );
    const returnRecord = returnRecordResult.rows[0];
    returnRecordId = returnRecord.id;

    for (const item of dedupedItems) {
      if (item.item_type === 'CARTON') {
        const cartonResult = await client.query(
          'SELECT * FROM master_cartons WHERE carton_barcode = UPPER($1) FOR UPDATE',
          [item.barcode]
        );
        if (cartonResult.rows.length === 0) {
          throw new NotFoundError(`Carton not found: ${item.barcode}`);
        }
        const carton = cartonResult.rows[0];
        if (carton.status !== MASTER_CARTON_STATUS.DISPATCHED) {
          throw new BadRequestError(
            `Carton ${item.barcode} is not dispatched (status ${carton.status}); cannot return`
          );
        }

        const originDispatchId = await resolveOriginDispatchId(client, 'CARTON', carton.id);

        await client.query(
          `UPDATE master_cartons SET status = $1, dispatched_at = NULL, updated_at = NOW() WHERE id = $2`,
          [MASTER_CARTON_STATUS.CLOSED, carton.id]
        );

        const boxesResult = await client.query(
          `SELECT cb.id, cb.barcode FROM carton_child_mapping ccm
           JOIN child_boxes cb ON cb.id = ccm.child_box_id
           WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND cb.status = $2`,
          [carton.id, CHILD_BOX_STATUS.DISPATCHED]
        );

        for (const box of boxesResult.rows) {
          await client.query(
            `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
            [CHILD_BOX_STATUS.PACKED, box.id]
          );

          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              TRANSACTION_TYPES.CHILD_RETURNED, box.id, carton.id, returnedBy,
              `Child box ${box.barcode} returned with carton ${carton.carton_barcode}`,
              JSON.stringify({ return_record_id: returnRecord.id }),
            ]
          );

          await client.query(
            `INSERT INTO return_items (return_record_id, child_box_id, master_carton_id, dispatch_record_id, item_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [returnRecord.id, box.id, carton.id, originDispatchId, 'CARTON']
          );
          boxCount += 1;
        }

        // Carton left the channel — deactivate any active channel allocation
        await client.query(
          `UPDATE ecommerce_carton_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
           WHERE master_carton_id = $2 AND is_active = true`,
          [returnedBy, carton.id]
        );
        await client.query(
          `UPDATE sample_carton_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
           WHERE master_carton_id = $2 AND is_active = true`,
          [returnedBy, carton.id]
        );

        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TRANSACTION_TYPES.CARTON_RETURNED, carton.id, returnedBy,
            `Carton ${carton.carton_barcode} returned`,
            JSON.stringify({ return_record_id: returnRecord.id, box_count: boxesResult.rows.length }),
          ]
        );
      } else {
        const boxResult = await client.query(
          'SELECT cb.* FROM child_boxes cb WHERE cb.barcode = UPPER($1) FOR UPDATE',
          [item.barcode]
        );
        if (boxResult.rows.length === 0) {
          throw new NotFoundError(`Child box not found: ${item.barcode}`);
        }
        const box = boxResult.rows[0];
        if (box.status !== CHILD_BOX_STATUS.DISPATCHED) {
          throw new BadRequestError(
            `Box ${item.barcode} is not dispatched (status ${box.status}); cannot return`
          );
        }

        const sampleMapResult = await client.query(
          'SELECT 1 FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true',
          [box.id]
        );
        if (sampleMapResult.rows.length > 0) {
          throw new BadRequestError('Sample box returns are not supported');
        }

        // Resolve origin dispatch BEFORE deactivating the box's mappings (the
        // resolver reads the active carton/e-commerce mapping).
        const originDispatchId = await resolveOriginDispatchId(client, 'BOX', box.id);

        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
          [CHILD_BOX_STATUS.FREE, box.id]
        );

        await client.query(
          `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1
           WHERE child_box_id = $2 AND is_active = true`,
          [returnedBy, box.id]
        );
        await client.query(
          `UPDATE ecommerce_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
           WHERE child_box_id = $2 AND is_active = true`,
          [returnedBy, box.id]
        );

        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TRANSACTION_TYPES.CHILD_RETURNED, box.id, returnedBy,
            `Child box ${box.barcode} returned`,
            JSON.stringify({ return_record_id: returnRecord.id }),
          ]
        );

        await client.query(
          `INSERT INTO return_items (return_record_id, child_box_id, master_carton_id, dispatch_record_id, item_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [returnRecord.id, box.id, null, originDispatchId, 'BOX']
        );
        boxCount += 1;
      }
      itemCount += 1;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await createAuditLog({
    userId: returnedBy,
    action: 'CREATE_RETURN',
    entityType: 'return_record',
    entityId: returnRecordId,
    newValues: {
      item_count: itemCount,
      box_count: boxCount,
      dispatch_record_id: input.dispatch_record_id || null,
    },
  });

  logger.info(`Return created: ${itemCount} items (${boxCount} boxes) by ${returnedBy}`);

  return getReturnById(returnRecordId);
}

export async function getReturnById(id: string): Promise<ReturnRecord & { items: unknown[] }> {
  const result = await query(
    `SELECT rr.*,
       COALESCE(mc.carton_barcode, er.ecommerce_barcode) AS source_label,
       c.firm_name AS customer_firm_name,
       u.name AS returned_by_name
     FROM return_records rr
     LEFT JOIN dispatch_records dr ON dr.id = rr.dispatch_record_id
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = rr.customer_id
     JOIN users u ON u.id = rr.returned_by
     WHERE rr.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Return record not found');
  }
  const returnRecord = result.rows[0];

  const itemsResult = await query(
    `SELECT ri.id, ri.item_type, ri.child_box_id, ri.master_carton_id, ri.dispatch_record_id,
       cb.barcode, p.article_name, p.colour, p.size, p.mrp,
       mc.carton_barcode,
       COALESCE(odmc.carton_barcode, oder.ecommerce_barcode) AS origin_dispatch_label
     FROM return_items ri
     LEFT JOIN child_boxes cb ON cb.id = ri.child_box_id
     LEFT JOIN products p ON p.id = cb.product_id
     LEFT JOIN master_cartons mc ON mc.id = ri.master_carton_id
     LEFT JOIN dispatch_records dr ON dr.id = ri.dispatch_record_id
     LEFT JOIN master_cartons odmc ON odmc.id = dr.master_carton_id
     LEFT JOIN ecommerce_records oder ON oder.id = dr.ecommerce_record_id
     WHERE ri.return_record_id = $1
     ORDER BY ri.created_at`,
    [id]
  );

  return { ...returnRecord, items: itemsResult.rows };
}

export async function getReturns(
  filters: { from_date?: string; to_date?: string; search?: string },
  page: number = 1,
  limit: number = 25
): Promise<{ data: ReturnRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.from_date) {
    conditions.push(`rr.return_date >= $${paramIndex++}`);
    values.push(filters.from_date);
  }
  if (filters.to_date) {
    conditions.push(`rr.return_date <= $${paramIndex++}`);
    values.push(filters.to_date);
  }
  if (filters.search) {
    conditions.push(
      `(c.firm_name ILIKE $${paramIndex} OR rr.notes ILIKE $${paramIndex} OR mc.carton_barcode ILIKE $${paramIndex} OR er.ecommerce_barcode ILIKE $${paramIndex})`
    );
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM return_records rr
     LEFT JOIN dispatch_records dr ON dr.id = rr.dispatch_record_id
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = rr.customer_id
     ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT rr.*,
       COALESCE(mc.carton_barcode, er.ecommerce_barcode) AS source_label,
       c.firm_name AS customer_firm_name,
       u.name AS returned_by_name,
       ps.article_summary, ps.colour_summary, ps.size_summary,
       ps.item_count, ps.box_count, ps.pairs
     FROM return_records rr
     LEFT JOIN dispatch_records dr ON dr.id = rr.dispatch_record_id
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = rr.customer_id
     JOIN users u ON u.id = rr.returned_by
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') as article_summary,
         string_agg(DISTINCT p.colour, ', ') as colour_summary,
         string_agg(DISTINCT p.size, ', ') as size_summary,
         COUNT(*) as item_count,
         COUNT(DISTINCT ri.child_box_id) as box_count,
         COALESCE(SUM(cb.quantity), 0) as pairs
       FROM return_items ri
       JOIN child_boxes cb ON cb.id = ri.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ri.return_record_id = rr.id
     ) ps ON true
     ${whereClause}
     ORDER BY rr.return_date DESC, rr.created_at DESC, rr.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}
