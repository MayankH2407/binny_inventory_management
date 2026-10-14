import { PoolClient } from 'pg';
import { query, getClient } from '../config/database';
import { generateUniqueBarcode } from '../utils/barcodeGenerator';
import {
  CHILD_BOX_STATUS,
  MASTER_CARTON_STATUS,
  TRANSACTION_TYPES,
  STOCK_RECON_STATUS,
  USER_ROLES,
} from '../config/constants';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { resolveChannelBarcode } from './channelAllocation.service';
import {
  OpenSessionInput,
  ScanItemInput,
  RejectSessionInput,
} from '../models/schemas/stockReconciliation.schema';
import { StockReconciliationSession } from '../types';
import { logger } from '../utils/logger';

type ScopeFilter = { section?: string; category?: string; article_group?: string };

// Main-warehouse stock only. E-commerce and sample stock are separate
// inventories (like a warehouse transfer) and are NOT part of a verification
// session — ECOMMERCE/SAMPLE boxes and cartons allocated intact to a
// sample/e-commerce record are excluded from the snapshot and, if scanned,
// reported as out of scope rather than counted or flagged missing.
const EXPECTED_BOX_STATUSES = [
  CHILD_BOX_STATUS.FREE,
  CHILD_BOX_STATUS.PACKED,
];

const CHANNEL_STATUSES: string[] = [CHILD_BOX_STATUS.ECOMMERCE, CHILD_BOX_STATUS.SAMPLE];

/** SQL: carton `col` is currently allocated (unshipped) to a sample or e-commerce record. */
function cartonAllocatedSql(col: string): string {
  return `(EXISTS (SELECT 1 FROM sample_carton_mapping scm WHERE scm.master_carton_id = ${col} AND scm.is_active = true AND scm.dispatch_record_id IS NULL)
     OR EXISTS (SELECT 1 FROM ecommerce_carton_mapping ecm WHERE ecm.master_carton_id = ${col} AND ecm.is_active = true AND ecm.dispatch_record_id IS NULL))`;
}

async function isCartonAllocatedToChannel(client: PoolClient, cartonId: string): Promise<boolean> {
  const r = await client.query(`SELECT ${cartonAllocatedSql('$1::uuid')} AS allocated`, [cartonId]);
  return !!r.rows[0]?.allocated;
}

/**
 * SQL: scan `sc` credits expected BOX row `e` — either the box itself was
 * scanned, or a carton scan (not flagged mismatched) covers it. Carton
 * coverage uses the box's carton at snapshot time OR its CURRENT active
 * carton, so a carton packed/repacked mid-session still credits its boxes.
 */
function creditsExpectedBox(sc: string, e: string): string {
  return `(${sc}.child_box_id = ${e}.child_box_id
    OR (${sc}.master_carton_id IS NOT NULL AND ${sc}.contents_mismatch = false AND (
      ${e}.master_carton_id = ${sc}.master_carton_id
      OR EXISTS (SELECT 1 FROM carton_child_mapping m WHERE m.child_box_id = ${e}.child_box_id AND m.is_active = true AND m.master_carton_id = ${sc}.master_carton_id)
    )))`;
}

// ---------------------------------------------------------------------------
// Scope matching — same trim/upper text comparison used for legacy cartons
// throughout inventory.service.ts (see the b274e28 fix). A scope with no
// filters set matches everything.
// ---------------------------------------------------------------------------
function scopeConditions(scope: ScopeFilter, columns: { section: string; category: string; article_group: string }, values: unknown[], startIndex: number): { sql: string; nextIndex: number } {
  const conditions: string[] = [];
  let idx = startIndex;
  if (scope.section) {
    conditions.push(`UPPER(TRIM(${columns.section})) = UPPER(TRIM($${idx++}))`);
    values.push(scope.section);
  }
  if (scope.category) {
    conditions.push(`UPPER(TRIM(${columns.category})) = UPPER(TRIM($${idx++}))`);
    values.push(scope.category);
  }
  if (scope.article_group) {
    conditions.push(`UPPER(TRIM(${columns.article_group})) = UPPER(TRIM($${idx++}))`);
    values.push(scope.article_group);
  }
  return { sql: conditions.length > 0 ? conditions.join(' AND ') : 'TRUE', nextIndex: idx };
}

// ---------------------------------------------------------------------------
// Open — snapshot expected stock for the session's scope. Snapshot is frozen
// at open time (stored as its own rows), so it never moves under counting
// staff while the session is open.
// ---------------------------------------------------------------------------
export async function openSession(
  input: OpenSessionInput,
  createdBy: string
): Promise<StockReconciliationSession> {
  const sessionCode = await generateUniqueBarcode('RC');
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `INSERT INTO stock_reconciliation_sessions (session_code, status, scope, notes, snapshot_at, created_by)
       VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING *`,
      [sessionCode, STOCK_RECON_STATUS.COUNTING, JSON.stringify(input.scope || {}), input.notes || null, createdBy]
    );
    const session = sessionResult.rows[0];

    await snapshotExpected(client, session.id, input.scope || {});

    await client.query('COMMIT');

    await createAuditLog({
      userId: createdBy,
      action: 'OPEN_STOCK_RECONCILIATION',
      entityType: 'stock_reconciliation_session',
      entityId: session.id,
      newValues: { session_code: sessionCode, scope: input.scope || {} },
    });

    logger.info(`Stock reconciliation session opened: ${sessionCode}`);
    return session;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function snapshotExpected(client: PoolClient, sessionId: string, scope: ScopeFilter): Promise<void> {
  const boxValues: unknown[] = [sessionId];
  const boxScope = scopeConditions(scope, { section: 'p.section', category: 'p.category', article_group: 'p.article_group' }, boxValues, 2);

  await client.query(
    `INSERT INTO stock_reconciliation_expected (session_id, item_type, child_box_id, master_carton_id, product_id, status_at_snapshot)
     SELECT $1, 'BOX', cb.id, ccm.master_carton_id, cb.product_id, cb.status
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     LEFT JOIN carton_child_mapping ccm ON ccm.child_box_id = cb.id AND ccm.is_active = true
     WHERE cb.status IN ('FREE', 'PACKED')
       AND (ccm.master_carton_id IS NULL OR NOT ${cartonAllocatedSql('ccm.master_carton_id')})
       AND ${boxScope.sql}`,
    boxValues
  );

  const legacyValues: unknown[] = [sessionId];
  const legacyScope = scopeConditions(scope, { section: 'mc.section', category: 'mc.category', article_group: 'mc.article_group' }, legacyValues, 2);

  await client.query(
    `INSERT INTO stock_reconciliation_expected (session_id, item_type, master_carton_id, status_at_snapshot)
     SELECT $1, 'LEGACY_CARTON', mc.id, mc.status
     FROM master_cartons mc
     WHERE mc.is_legacy = true AND mc.status NOT IN ('DISPATCHED', 'MISSING')
       AND NOT ${cartonAllocatedSql('mc.id')}
       AND ${legacyScope.sql}`,
    legacyValues
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function getSessionById(id: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT s.*, cu.name AS created_by_name, su.name AS submitted_by_name,
       au.name AS approved_by_name, ru.name AS rejected_by_name, pu.name AS posted_by_name
     FROM stock_reconciliation_sessions s
     JOIN users cu ON cu.id = s.created_by
     LEFT JOIN users su ON su.id = s.submitted_by
     LEFT JOIN users au ON au.id = s.approved_by
     LEFT JOIN users ru ON ru.id = s.rejected_by
     LEFT JOIN users pu ON pu.id = s.posted_by
     WHERE s.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Stock reconciliation session not found');
  }
  return result.rows[0];
}

async function requireSession(client: { query: typeof query }, id: string): Promise<Record<string, unknown>> {
  const result = await client.query('SELECT * FROM stock_reconciliation_sessions WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Stock reconciliation session not found');
  }
  return result.rows[0];
}

export async function getSessions(
  filters: { status?: string },
  page: number = 1,
  limit: number = 25
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`s.status = $${paramIndex++}`);
    values.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM stock_reconciliation_sessions s ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT s.*, cu.name AS created_by_name,
       (SELECT COUNT(*) FROM stock_reconciliation_expected e WHERE e.session_id = s.id) AS expected_count,
       (SELECT COUNT(DISTINCT COALESCE(sc.child_box_id::text, sc.master_carton_id::text))
        FROM stock_reconciliation_scans sc WHERE sc.session_id = s.id AND sc.result = 'OK') AS scanned_count
     FROM stock_reconciliation_sessions s
     JOIN users cu ON cu.id = s.created_by
     ${whereClause}
     ORDER BY s.created_at DESC, s.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function getProgress(sessionId: string): Promise<Record<string, unknown>> {
  await requireSession({ query }, sessionId);

  const expectedResult = await query(
    `SELECT item_type, COUNT(*)::int AS count FROM stock_reconciliation_expected WHERE session_id = $1 GROUP BY item_type`,
    [sessionId]
  );
  const scanResult = await query(
    `SELECT result, COUNT(*)::int AS count FROM stock_reconciliation_scans WHERE session_id = $1 GROUP BY result`,
    [sessionId]
  );
  const foundBoxesResult = await query(
    `SELECT COUNT(DISTINCT e.id)::int AS count
     FROM stock_reconciliation_expected e
     WHERE e.session_id = $1 AND (
       EXISTS (SELECT 1 FROM stock_reconciliation_scans sc WHERE sc.session_id = $1 AND sc.result = 'OK' AND (
         (e.item_type = 'BOX' AND ${creditsExpectedBox('sc', 'e')})
         OR (e.item_type = 'LEGACY_CARTON' AND sc.master_carton_id = e.master_carton_id)
       ))
     )`,
    [sessionId]
  );

  const expectedTotal = expectedResult.rows.reduce((sum: number, r: any) => sum + r.count, 0);

  return {
    expected_total: expectedTotal,
    expected_by_type: expectedResult.rows,
    found_total: foundBoxesResult.rows[0]?.count || 0,
    scans_by_result: scanResult.rows,
  };
}

// ---------------------------------------------------------------------------
// Scan history — so a counting screen reopened after a crash, reload, or the
// device itself dying can show exactly what's already been scanned in this
// session, not just an aggregate count. Most recent first, so the client can
// show it directly as its "recent scans" feed with no reordering.
// ---------------------------------------------------------------------------
export async function getSessionScans(
  sessionId: string,
  page: number = 1,
  limit: number = 200
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  await requireSession({ query }, sessionId);

  const countResult = await query(
    `SELECT COUNT(*) FROM stock_reconciliation_scans WHERE session_id = $1`,
    [sessionId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT sc.id, sc.client_scan_id, sc.raw_payload, sc.scan_type, sc.result,
       sc.contents_mismatch, sc.is_manual, sc.scanned_at, sc.created_at,
       COALESCE(cb.barcode, mc.carton_barcode, sc.raw_payload) AS resolved_code
     FROM stock_reconciliation_scans sc
     LEFT JOIN child_boxes cb ON cb.id = sc.child_box_id
     LEFT JOIN master_cartons mc ON mc.id = sc.master_carton_id
     WHERE sc.session_id = $1
     ORDER BY sc.created_at DESC, sc.id
     LIMIT $2 OFFSET $3`,
    [sessionId, limit, offset]
  );

  return { data: result.rows, total };
}

// ---------------------------------------------------------------------------
// Scan — resolves each scanned code, classifies it, and appends it to the
// session's append-only scan log. Idempotent per (session, client_scan_id) so
// an offline batch can be safely re-sent.
// ---------------------------------------------------------------------------
export async function submitScans(
  sessionId: string,
  scans: ScanItemInput[],
  scannedBy: string
): Promise<{ results: Record<string, unknown>[] }> {
  const client = await getClient();
  const results: Record<string, unknown>[] = [];

  try {
    await client.query('BEGIN');

    const sessionResult = await client.query('SELECT * FROM stock_reconciliation_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
    if (sessionResult.rows.length === 0) {
      throw new NotFoundError('Stock reconciliation session not found');
    }
    const session = sessionResult.rows[0];
    if (session.status !== STOCK_RECON_STATUS.COUNTING) {
      throw new BadRequestError(`Session is ${session.status}; scans can only be submitted while COUNTING`);
    }

    for (const scan of scans) {
      const existing = await client.query(
        `SELECT * FROM stock_reconciliation_scans WHERE session_id = $1 AND client_scan_id = $2`,
        [sessionId, scan.client_scan_id]
      );
      if (existing.rows.length > 0) {
        results.push(toScanResult(existing.rows[0], true));
        continue;
      }

      const classified = await classifyScan(client, sessionId, session, scan);
      const inserted = await client.query(
        `INSERT INTO stock_reconciliation_scans
           (session_id, client_scan_id, raw_payload, scan_type, child_box_id, master_carton_id,
            result, contents_mismatch, is_manual, scanned_by, scanned_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          sessionId, scan.client_scan_id, scan.raw_payload, classified.scan_type,
          classified.child_box_id, classified.master_carton_id, classified.result,
          scan.contents_mismatch && classified.scan_type === 'CARTON', scan.is_manual,
          scannedBy, scan.scanned_at ? new Date(scan.scanned_at) : new Date(),
        ]
      );
      results.push(toScanResult(inserted.rows[0], false, classified.message));
    }

    await client.query('COMMIT');
    return { results };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function toScanResult(row: any, wasReplayed: boolean, message?: string): Record<string, unknown> {
  return {
    client_scan_id: row.client_scan_id,
    scan_type: row.scan_type,
    result: row.result,
    contents_mismatch: row.contents_mismatch,
    replayed: wasReplayed,
    message: message || null,
  };
}

interface ClassifiedScan {
  scan_type: 'BOX' | 'CARTON' | 'UNKNOWN';
  child_box_id: string | null;
  master_carton_id: string | null;
  result: 'OK' | 'DUPLICATE' | 'NOT_EXPECTED' | 'OUT_OF_SCOPE' | 'STATUS_CONFLICT' | 'UNKNOWN';
  message?: string;
}

async function classifyScan(
  client: PoolClient,
  sessionId: string,
  session: Record<string, any>,
  scan: ScanItemInput
): Promise<ClassifiedScan> {
  let resolved: { item_type: 'BOX' | 'CARTON' | 'SAMPLE_RECORD'; id: string; barcode: string };
  try {
    resolved = await resolveChannelBarcode(client, scan.raw_payload);
  } catch {
    return { scan_type: 'UNKNOWN', child_box_id: null, master_carton_id: null, result: 'UNKNOWN' };
  }

  if (resolved.item_type === 'SAMPLE_RECORD') {
    // Never happens today (includeSampleRecords is left false above), kept
    // as a defensive fallback if that ever changes.
    return { scan_type: 'UNKNOWN', child_box_id: null, master_carton_id: null, result: 'UNKNOWN' };
  }

  if (resolved.item_type === 'BOX') {
    return classifyBoxScan(client, sessionId, session, resolved.id);
  }
  return classifyCartonScan(client, sessionId, session, resolved.id, scan.contents_mismatch);
}

async function classifyBoxScan(
  client: PoolClient,
  sessionId: string,
  session: Record<string, any>,
  childBoxId: string
): Promise<ClassifiedScan> {
  const boxResult = await client.query(
    `SELECT cb.id, cb.status, cb.product_id, p.section, p.category, p.article_group
     FROM child_boxes cb JOIN products p ON p.id = cb.product_id WHERE cb.id = $1`,
    [childBoxId]
  );
  const box = boxResult.rows[0];

  // E-commerce / sample stock is a separate inventory — not verified here.
  const boxCarton = await client.query(
    `SELECT master_carton_id FROM carton_child_mapping WHERE child_box_id = $1 AND is_active = true LIMIT 1`,
    [childBoxId]
  );
  const boxCartonId: string | undefined = boxCarton.rows[0]?.master_carton_id;
  if (CHANNEL_STATUSES.includes(box.status) || (boxCartonId && await isCartonAllocatedToChannel(client, boxCartonId))) {
    return {
      scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'OUT_OF_SCOPE',
      message: 'Belongs to E-commerce / Sample inventory — verified separately',
    };
  }

  const alreadyScanned = await client.query(
    `SELECT 1 FROM stock_reconciliation_scans WHERE session_id = $1 AND child_box_id = $2 AND result = 'OK'`,
    [sessionId, childBoxId]
  );
  if (alreadyScanned.rows.length > 0) {
    return { scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'DUPLICATE' };
  }

  const expected = await client.query(
    `SELECT 1 FROM stock_reconciliation_expected WHERE session_id = $1 AND child_box_id = $2`,
    [sessionId, childBoxId]
  );

  if (expected.rows.length > 0) {
    if (EXPECTED_BOX_STATUSES.includes(box.status)) {
      return { scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'OK' };
    }
    return {
      scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'STATUS_CONFLICT',
      message: `Box is currently ${box.status} in the system`,
    };
  }

  if (!EXPECTED_BOX_STATUSES.includes(box.status)) {
    return {
      scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'STATUS_CONFLICT',
      message: `Box is currently ${box.status} in the system`,
    };
  }

  const scope = session.scope as ScopeFilter;
  if (!matchesScopeValues(scope, box)) {
    return { scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'OUT_OF_SCOPE' };
  }

  return {
    scan_type: 'BOX', child_box_id: childBoxId, master_carton_id: null, result: 'NOT_EXPECTED',
    message: 'Box was not in stock when this session opened',
  };
}

async function classifyCartonScan(
  client: PoolClient,
  sessionId: string,
  session: Record<string, any>,
  cartonId: string,
  contentsMismatch: boolean
): Promise<ClassifiedScan> {
  const cartonResult = await client.query(
    `SELECT id, status, is_legacy, section, category, article_group FROM master_cartons WHERE id = $1`,
    [cartonId]
  );
  const carton = cartonResult.rows[0];

  if (await isCartonAllocatedToChannel(client, cartonId)) {
    return {
      scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'OUT_OF_SCOPE',
      message: 'Allocated to E-commerce / Sample inventory — verified separately',
    };
  }

  const alreadyScanned = await client.query(
    `SELECT 1 FROM stock_reconciliation_scans WHERE session_id = $1 AND master_carton_id = $2 AND result = 'OK'`,
    [sessionId, cartonId]
  );
  if (alreadyScanned.rows.length > 0) {
    return { scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'DUPLICATE' };
  }

  const expected = await client.query(
    `SELECT 1 FROM stock_reconciliation_expected WHERE session_id = $1 AND master_carton_id = $2`,
    [sessionId, cartonId]
  );

  if (expected.rows.length > 0) {
    if (carton.status === MASTER_CARTON_STATUS.DISPATCHED || carton.status === MASTER_CARTON_STATUS.MISSING) {
      return {
        scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'STATUS_CONFLICT',
        message: `Carton is currently ${carton.status} in the system`,
      };
    }
    const creditedResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM stock_reconciliation_expected WHERE session_id = $1 AND master_carton_id = $2 AND item_type = 'BOX'`,
      [sessionId, cartonId]
    );
    const creditedCount = creditedResult.rows[0]?.count || 0;
    return {
      scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'OK',
      message: contentsMismatch
        ? 'Contents flagged as mismatched — scan boxes individually'
        : creditedCount > 0
          ? `Credits ${creditedCount} expected box(es)`
          : undefined,
    };
  }

  if (carton.status === MASTER_CARTON_STATUS.DISPATCHED || carton.status === MASTER_CARTON_STATUS.MISSING) {
    return {
      scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'STATUS_CONFLICT',
      message: `Carton is currently ${carton.status} in the system`,
    };
  }

  // Carton wasn't in the snapshot as a carton, but may now hold boxes that ARE
  // expected in this session (e.g. the loose boxes were packed into it after
  // the session opened). Scanning it then credits those boxes — it is not an
  // unexpected carton.
  const coveredResult = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM stock_reconciliation_expected e
     JOIN carton_child_mapping m ON m.child_box_id = e.child_box_id AND m.is_active = true AND m.master_carton_id = $2
     WHERE e.session_id = $1 AND e.item_type = 'BOX'`,
    [sessionId, cartonId]
  );
  const coveredCount = coveredResult.rows[0]?.count || 0;
  if (coveredCount > 0) {
    return {
      scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'OK',
      message: contentsMismatch
        ? 'Contents flagged as mismatched — scan boxes individually'
        : `Credits ${coveredCount} expected box(es) packed into this carton since the session opened`,
    };
  }

  const scope = session.scope as ScopeFilter;
  const inScope = carton.is_legacy
    ? matchesScopeValues(scope, carton)
    : await cartonHasScopedBox(client, cartonId, scope);

  if (!inScope) {
    return { scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'OUT_OF_SCOPE' };
  }

  return {
    scan_type: 'CARTON', child_box_id: null, master_carton_id: cartonId, result: 'NOT_EXPECTED',
    message: 'Carton was not in this scope when the session opened',
  };
}

function matchesScopeValues(scope: ScopeFilter, row: { section?: string; category?: string; article_group?: string }): boolean {
  const norm = (v?: string | null) => (v || '').trim().toUpperCase();
  if (scope.section && norm(scope.section) !== norm(row.section)) return false;
  if (scope.category && norm(scope.category) !== norm(row.category)) return false;
  if (scope.article_group && norm(scope.article_group) !== norm(row.article_group)) return false;
  return true;
}

async function cartonHasScopedBox(client: PoolClient, cartonId: string, scope: ScopeFilter): Promise<boolean> {
  if (!scope.section && !scope.category && !scope.article_group) {
    const anyBox = await client.query(
      `SELECT 1 FROM carton_child_mapping WHERE master_carton_id = $1 AND is_active = true LIMIT 1`,
      [cartonId]
    );
    return anyBox.rows.length > 0;
  }
  const values: unknown[] = [cartonId];
  const scoped = scopeConditions(scope, { section: 'p.section', category: 'p.category', article_group: 'p.article_group' }, values, 2);
  const result = await client.query(
    `SELECT 1 FROM carton_child_mapping ccm
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND ${scoped.sql} LIMIT 1`,
    values
  );
  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Variance — computed on read from stock_reconciliation_expected +
// stock_reconciliation_scans, never stored (same approach as Alstone).
// ---------------------------------------------------------------------------
export async function getVariance(sessionId: string): Promise<Record<string, unknown>> {
  await requireSession({ query }, sessionId);

  const skuSummaryResult = await query(
    `SELECT p.id AS product_id, p.article_name, p.colour, p.size, p.sku, p.mrp,
       COUNT(*)::int AS expected_qty,
       COUNT(*) FILTER (WHERE found.is_found) ::int AS physical_qty
     FROM stock_reconciliation_expected e
     JOIN products p ON p.id = e.product_id
     LEFT JOIN LATERAL (
       SELECT EXISTS (
         SELECT 1 FROM stock_reconciliation_scans sc
         WHERE sc.session_id = e.session_id AND sc.result = 'OK' AND ${creditsExpectedBox('sc', 'e')}
       ) AS is_found
     ) found ON true
     WHERE e.session_id = $1 AND e.item_type = 'BOX'
     GROUP BY p.id, p.article_name, p.colour, p.size, p.sku, p.mrp
     ORDER BY ABS((COUNT(*) - COUNT(*) FILTER (WHERE found.is_found)) * COALESCE(p.mrp, 0)) DESC`,
    [sessionId]
  );

  const missingBoxesResult = await query(
    `SELECT cb.id, cb.barcode, p.article_name, p.colour, p.size, p.sku
     FROM stock_reconciliation_expected e
     JOIN child_boxes cb ON cb.id = e.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE e.session_id = $1 AND e.item_type = 'BOX' AND NOT EXISTS (
       SELECT 1 FROM stock_reconciliation_scans sc
       WHERE sc.session_id = e.session_id AND sc.result = 'OK' AND ${creditsExpectedBox('sc', 'e')}
     )`,
    [sessionId]
  );

  const missingLegacyCartonsResult = await query(
    `SELECT mc.id, mc.carton_barcode, mc.article_group, mc.legacy_pairs
     FROM stock_reconciliation_expected e
     JOIN master_cartons mc ON mc.id = e.master_carton_id
     WHERE e.session_id = $1 AND e.item_type = 'LEGACY_CARTON' AND NOT EXISTS (
       SELECT 1 FROM stock_reconciliation_scans sc
       WHERE sc.session_id = e.session_id AND sc.result = 'OK' AND sc.master_carton_id = e.master_carton_id
     )`,
    [sessionId]
  );

  const foundAgainResult = await query(
    `SELECT DISTINCT ON (COALESCE(sc.child_box_id::text, sc.master_carton_id::text))
       sc.scan_type, sc.child_box_id, sc.master_carton_id,
       cb.barcode AS box_barcode, mc.carton_barcode
     FROM stock_reconciliation_scans sc
     LEFT JOIN child_boxes cb ON cb.id = sc.child_box_id AND cb.status = 'MISSING'
     LEFT JOIN master_cartons mc ON mc.id = sc.master_carton_id AND mc.status = 'MISSING'
     WHERE sc.session_id = $1 AND sc.result = 'STATUS_CONFLICT'
       AND ((sc.child_box_id IS NOT NULL AND cb.id IS NOT NULL) OR (sc.master_carton_id IS NOT NULL AND mc.id IS NOT NULL))`,
    [sessionId]
  );

  const conflictsResult = await query(
    `SELECT sc.scan_type, sc.child_box_id, sc.master_carton_id, cb.barcode AS box_barcode,
       cb.status AS box_status, mc.carton_barcode, mc.status AS carton_status
     FROM stock_reconciliation_scans sc
     LEFT JOIN child_boxes cb ON cb.id = sc.child_box_id
     LEFT JOIN master_cartons mc ON mc.id = sc.master_carton_id
     WHERE sc.session_id = $1 AND sc.result = 'STATUS_CONFLICT'
       AND COALESCE(cb.status::text, mc.status::text) <> 'MISSING'`,
    [sessionId]
  );

  const otherResult = await query(
    `SELECT result, raw_payload, is_manual, created_at
     FROM stock_reconciliation_scans WHERE session_id = $1 AND result IN ('OUT_OF_SCOPE', 'UNKNOWN', 'NOT_EXPECTED', 'DUPLICATE')
     ORDER BY created_at`,
    [sessionId]
  );

  return {
    sku_summary: skuSummaryResult.rows,
    missing_boxes: missingBoxesResult.rows,
    missing_legacy_cartons: missingLegacyCartonsResult.rows,
    found_again: foundAgainResult.rows,
    conflicts: conflictsResult.rows,
    out_of_scope: otherResult.rows.filter((r: any) => r.result === 'OUT_OF_SCOPE'),
    not_expected: otherResult.rows.filter((r: any) => r.result === 'NOT_EXPECTED'),
    unknown: otherResult.rows.filter((r: any) => r.result === 'UNKNOWN'),
    duplicates: otherResult.rows.filter((r: any) => r.result === 'DUPLICATE'),
  };
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export async function getVarianceCSV(sessionId: string): Promise<string> {
  const variance = await getVariance(sessionId);
  const headers = ['SKU', 'Article', 'Colour', 'Size', 'Expected', 'Physical', 'Variance', 'MRP'];
  const rows = (variance.sku_summary as any[]).map((r) => [
    String(r.sku), String(r.article_name), String(r.colour), String(r.size),
    String(r.expected_qty), String(r.physical_qty), String(r.physical_qty - r.expected_qty),
    String(r.mrp ?? ''),
  ]);
  return toCSV(headers, rows);
}

// ---------------------------------------------------------------------------
// State machine transitions
// ---------------------------------------------------------------------------
export async function submitSession(sessionId: string, userId: string): Promise<StockReconciliationSession> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const session = await lockSessionInStatus(client, sessionId, [STOCK_RECON_STATUS.COUNTING]);

    const result = await client.query(
      `UPDATE stock_reconciliation_sessions SET status = $1, submitted_by = $2, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [STOCK_RECON_STATUS.SUBMITTED, userId, sessionId]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId, action: 'SUBMIT_STOCK_RECONCILIATION', entityType: 'stock_reconciliation_session', entityId: sessionId,
    });

    logger.info(`Stock reconciliation session submitted: ${session.session_code}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelSession(sessionId: string, userId: string): Promise<StockReconciliationSession> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await lockSessionInStatus(client, sessionId, [STOCK_RECON_STATUS.COUNTING, STOCK_RECON_STATUS.SUBMITTED]);

    const result = await client.query(
      `UPDATE stock_reconciliation_sessions SET status = $1, cancelled_by = $2, cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [STOCK_RECON_STATUS.CANCELLED, userId, sessionId]
    );

    await client.query('COMMIT');
    await createAuditLog({ userId, action: 'CANCEL_STOCK_RECONCILIATION', entityType: 'stock_reconciliation_session', entityId: sessionId });
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function isAdminUser(client: PoolClient, userId: string): Promise<boolean> {
  const r = await client.query(
    `SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0]?.name === USER_ROLES.ADMIN;
}

export async function approveSession(sessionId: string, userId: string): Promise<StockReconciliationSession> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const session = await lockSessionInStatus(client, sessionId, [STOCK_RECON_STATUS.SUBMITTED]);

    // Separation of duties: a non-admin approver must differ from whoever
    // opened or submitted the count, so a miscount can't be silently
    // self-approved. Admin is exempt — otherwise an admin who rejects a count
    // and opens the recount themselves can never give final approval.
    if ((session.created_by === userId || session.submitted_by === userId) && !(await isAdminUser(client, userId))) {
      throw new ForbiddenError('You counted or submitted this session; a different user must approve it');
    }

    const result = await client.query(
      `UPDATE stock_reconciliation_sessions SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [STOCK_RECON_STATUS.APPROVED, userId, sessionId]
    );

    await client.query('COMMIT');
    await createAuditLog({ userId, action: 'APPROVE_STOCK_RECONCILIATION', entityType: 'stock_reconciliation_session', entityId: sessionId });
    logger.info(`Stock reconciliation session approved: ${session.session_code}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectSession(sessionId: string, input: RejectSessionInput, userId: string): Promise<StockReconciliationSession> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const session = await lockSessionInStatus(client, sessionId, [STOCK_RECON_STATUS.SUBMITTED]);

    const result = await client.query(
      `UPDATE stock_reconciliation_sessions
       SET status = $1, rejected_by = $2, rejected_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [STOCK_RECON_STATUS.REJECTED, userId, input.reason, sessionId]
    );

    await client.query('COMMIT');
    await createAuditLog({
      userId, action: 'REJECT_STOCK_RECONCILIATION', entityType: 'stock_reconciliation_session', entityId: sessionId,
      newValues: { reason: input.reason },
    });
    logger.info(`Stock reconciliation session rejected: ${session.session_code}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recountSession(sessionId: string, userId: string): Promise<StockReconciliationSession> {
  const original = await requireSession({ query }, sessionId);
  if (original.status !== STOCK_RECON_STATUS.REJECTED) {
    throw new BadRequestError('Only a rejected session can be recounted');
  }

  const sessionCode = await generateUniqueBarcode('RC');
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const sessionResult = await client.query(
      `INSERT INTO stock_reconciliation_sessions (session_code, status, scope, notes, snapshot_at, created_by, recount_of_session_id)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6) RETURNING *`,
      [sessionCode, STOCK_RECON_STATUS.COUNTING, JSON.stringify(original.scope), original.notes, userId, sessionId]
    );
    const newSession = sessionResult.rows[0];

    await snapshotExpected(client, newSession.id, original.scope as ScopeFilter);

    await client.query('COMMIT');
    await createAuditLog({
      userId, action: 'RECOUNT_STOCK_RECONCILIATION', entityType: 'stock_reconciliation_session', entityId: newSession.id,
      newValues: { recount_of_session_id: sessionId },
    });
    logger.info(`Stock reconciliation recount opened: ${sessionCode} (recount of ${original.session_code})`);
    return newSession;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function lockSessionInStatus(client: PoolClient, sessionId: string, allowed: string[]): Promise<Record<string, any>> {
  const result = await client.query('SELECT * FROM stock_reconciliation_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Stock reconciliation session not found');
  }
  const session = result.rows[0];
  if (!allowed.includes(session.status)) {
    throw new BadRequestError(`Session is ${session.status}; this action requires status ${allowed.join(' or ')}`);
  }
  return session;
}

// ---------------------------------------------------------------------------
// Post — the only step that mutates child_boxes / master_cartons. Conflicts
// (e.g. a DISPATCHED box found on the shelf) are reported, never
// auto-corrected. A box/carton that changed status since the snapshot is
// skipped (SKIPPED_MOVED), not blindly overwritten.
// ---------------------------------------------------------------------------
export async function postSession(sessionId: string, userId: string): Promise<StockReconciliationSession> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const session = await lockSessionInStatus(client, sessionId, [STOCK_RECON_STATUS.APPROVED]);

    const summary = { marked_missing_boxes: 0, marked_missing_cartons: 0, restored_boxes: 0, restored_cartons: 0, skipped_moved: 0 };
    const touchedCartonIds = new Set<string>();

    const expectedBoxes = await client.query(
      `SELECT e.child_box_id, e.master_carton_id, e.status_at_snapshot
       FROM stock_reconciliation_expected e WHERE e.session_id = $1 AND e.item_type = 'BOX'`,
      [sessionId]
    );

    for (const row of expectedBoxes.rows) {
      const found = await client.query(
        `SELECT 1 FROM stock_reconciliation_scans sc
         WHERE sc.session_id = $1 AND sc.result = 'OK' AND (
           sc.child_box_id = $2
           OR ($3::uuid IS NOT NULL AND sc.master_carton_id = $3 AND sc.contents_mismatch = false)
           OR (sc.master_carton_id IS NOT NULL AND sc.contents_mismatch = false AND EXISTS (
             SELECT 1 FROM carton_child_mapping m WHERE m.child_box_id = $2 AND m.is_active = true AND m.master_carton_id = sc.master_carton_id))
         ) LIMIT 1`,
        [sessionId, row.child_box_id, row.master_carton_id]
      );
      if (found.rows.length > 0) continue;

      const boxLock = await client.query('SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE', [row.child_box_id]);
      const box = boxLock.rows[0];
      if (!box || box.status !== row.status_at_snapshot) {
        await client.query(
          `INSERT INTO stock_reconciliation_adjustments (session_id, child_box_id, action, old_status, new_status, posted_by)
           VALUES ($1, $2, 'SKIPPED_MOVED', $3, $4, $5)`,
          [sessionId, row.child_box_id, row.status_at_snapshot, box?.status ?? null, userId]
        );
        summary.skipped_moved += 1;
        continue;
      }

      await client.query(`UPDATE child_boxes SET status = 'MISSING', updated_at = NOW() WHERE id = $1`, [box.id]);

      if (row.master_carton_id) {
        await client.query(
          `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1
           WHERE child_box_id = $2 AND master_carton_id = $3 AND is_active = true`,
          [userId, box.id, row.master_carton_id]
        );
        await client.query(
          `UPDATE master_cartons SET child_count = GREATEST(0, child_count - 1), updated_at = NOW() WHERE id = $1`,
          [row.master_carton_id]
        );
        touchedCartonIds.add(row.master_carton_id);
      }
      if (row.status_at_snapshot === CHILD_BOX_STATUS.ECOMMERCE) {
        await client.query(
          `UPDATE ecommerce_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
           WHERE child_box_id = $2 AND is_active = true AND dispatch_record_id IS NULL`,
          [userId, box.id]
        );
      }

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          TRANSACTION_TYPES.STOCK_RECON_MISSING, box.id, row.master_carton_id || null, userId,
          `Marked missing by stock reconciliation session ${session.session_code}`,
          JSON.stringify({ session_id: sessionId }),
        ]
      );
      await client.query(
        `INSERT INTO stock_reconciliation_adjustments (session_id, child_box_id, master_carton_id, action, old_status, new_status, posted_by)
         VALUES ($1, $2, $3, 'MARKED_MISSING', $4, 'MISSING', $5)`,
        [sessionId, box.id, row.master_carton_id || null, row.status_at_snapshot, userId]
      );
      summary.marked_missing_boxes += 1;
    }

    // Cartons emptied out entirely by the box removals above, and never
    // themselves scanned as found, are themselves missing.
    for (const cartonId of touchedCartonIds) {
      const cartonLock = await client.query('SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE', [cartonId]);
      const carton = cartonLock.rows[0];
      if (!carton || carton.child_count > 0 || carton.status === MASTER_CARTON_STATUS.MISSING) continue;
      const wasScanned = await client.query(
        `SELECT 1 FROM stock_reconciliation_scans WHERE session_id = $1 AND master_carton_id = $2 AND result = 'OK'`,
        [sessionId, cartonId]
      );
      if (wasScanned.rows.length > 0) continue;

      const oldStatus = carton.status;
      await client.query(`UPDATE master_cartons SET status = 'MISSING', updated_at = NOW() WHERE id = $1`, [cartonId]);
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [TRANSACTION_TYPES.STOCK_RECON_MISSING, cartonId, userId, `Emptied and marked missing by stock reconciliation session ${session.session_code}`, JSON.stringify({ session_id: sessionId })]
      );
      await client.query(
        `INSERT INTO stock_reconciliation_adjustments (session_id, master_carton_id, action, old_status, new_status, posted_by)
         VALUES ($1, $2, 'MARKED_MISSING', $3, 'MISSING', $4)`,
        [sessionId, cartonId, oldStatus, userId]
      );
      summary.marked_missing_cartons += 1;
    }

    // Legacy cartons expected but not found.
    const expectedLegacy = await client.query(
      `SELECT master_carton_id, status_at_snapshot FROM stock_reconciliation_expected WHERE session_id = $1 AND item_type = 'LEGACY_CARTON'`,
      [sessionId]
    );
    for (const row of expectedLegacy.rows) {
      const found = await client.query(
        `SELECT 1 FROM stock_reconciliation_scans WHERE session_id = $1 AND master_carton_id = $2 AND result = 'OK' LIMIT 1`,
        [sessionId, row.master_carton_id]
      );
      if (found.rows.length > 0) continue;

      const cartonLock = await client.query('SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE', [row.master_carton_id]);
      const carton = cartonLock.rows[0];
      if (!carton || carton.status !== row.status_at_snapshot) {
        await client.query(
          `INSERT INTO stock_reconciliation_adjustments (session_id, master_carton_id, action, old_status, new_status, posted_by)
           VALUES ($1, $2, 'SKIPPED_MOVED', $3, $4, $5)`,
          [sessionId, row.master_carton_id, row.status_at_snapshot, carton?.status ?? null, userId]
        );
        summary.skipped_moved += 1;
        continue;
      }

      await client.query(`UPDATE master_cartons SET status = 'MISSING', updated_at = NOW() WHERE id = $1`, [carton.id]);
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [TRANSACTION_TYPES.STOCK_RECON_MISSING, carton.id, userId, `Legacy carton marked missing by stock reconciliation session ${session.session_code}`, JSON.stringify({ session_id: sessionId })]
      );
      await client.query(
        `INSERT INTO stock_reconciliation_adjustments (session_id, master_carton_id, action, old_status, new_status, posted_by)
         VALUES ($1, $2, 'MARKED_MISSING', $3, 'MISSING', $4)`,
        [sessionId, carton.id, row.status_at_snapshot, userId]
      );
      summary.marked_missing_cartons += 1;
    }

    // Found-again: boxes/cartons currently MISSING that were scanned this
    // session (STATUS_CONFLICT scans against a currently-MISSING item).
    const foundAgainBoxes = await client.query(
      `SELECT DISTINCT sc.child_box_id FROM stock_reconciliation_scans sc
       JOIN child_boxes cb ON cb.id = sc.child_box_id
       WHERE sc.session_id = $1 AND sc.result = 'STATUS_CONFLICT' AND cb.status = 'MISSING'`,
      [sessionId]
    );
    for (const row of foundAgainBoxes.rows) {
      const boxLock = await client.query('SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE', [row.child_box_id]);
      const box = boxLock.rows[0];
      if (!box || box.status !== 'MISSING') continue;

      await client.query(`UPDATE child_boxes SET status = 'FREE', updated_at = NOW() WHERE id = $1`, [box.id]);
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [TRANSACTION_TYPES.STOCK_RECON_FOUND, box.id, userId, `Found again by stock reconciliation session ${session.session_code}`, JSON.stringify({ session_id: sessionId })]
      );
      await client.query(
        `INSERT INTO stock_reconciliation_adjustments (session_id, child_box_id, action, old_status, new_status, posted_by)
         VALUES ($1, $2, 'RESTORED_FOUND', 'MISSING', 'FREE', $3)`,
        [sessionId, box.id, userId]
      );
      summary.restored_boxes += 1;
    }

    const foundAgainCartons = await client.query(
      `SELECT DISTINCT sc.master_carton_id FROM stock_reconciliation_scans sc
       JOIN master_cartons mc ON mc.id = sc.master_carton_id
       WHERE sc.session_id = $1 AND sc.result = 'STATUS_CONFLICT' AND mc.status = 'MISSING'`,
      [sessionId]
    );
    for (const row of foundAgainCartons.rows) {
      const cartonLock = await client.query('SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE', [row.master_carton_id]);
      const carton = cartonLock.rows[0];
      if (!carton || carton.status !== 'MISSING') continue;

      await client.query(`UPDATE master_cartons SET status = 'CLOSED', updated_at = NOW() WHERE id = $1`, [carton.id]);
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [TRANSACTION_TYPES.STOCK_RECON_FOUND, carton.id, userId, `Found again by stock reconciliation session ${session.session_code}`, JSON.stringify({ session_id: sessionId })]
      );
      await client.query(
        `INSERT INTO stock_reconciliation_adjustments (session_id, master_carton_id, action, old_status, new_status, posted_by)
         VALUES ($1, $2, 'RESTORED_FOUND', 'MISSING', 'CLOSED', $3)`,
        [sessionId, carton.id, userId]
      );
      summary.restored_cartons += 1;
    }

    const result = await client.query(
      `UPDATE stock_reconciliation_sessions SET status = $1, posted_by = $2, posted_at = NOW(), summary = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [STOCK_RECON_STATUS.POSTED, userId, JSON.stringify(summary), sessionId]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId, action: 'POST_STOCK_RECONCILIATION', entityType: 'stock_reconciliation_session', entityId: sessionId,
      newValues: summary,
    });

    logger.info(`Stock reconciliation session posted: ${session.session_code} — ${JSON.stringify(summary)}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
