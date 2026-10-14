/**
 * Integration tests for the physical stock reconciliation feature (see
 * STOCK_RECONCILIATION_HANDOVER.md). Mirrors the dev-DB harness used by
 * sample.service.test.ts: connect via the real `query` helper, seed rows
 * under a unique prefix, track ids, clean up in afterAll.
 *
 * Covers the full open -> scan -> submit -> approve -> post chain for both a
 * carton auto-credit and a loose box, plus the classification edge cases
 * (duplicate, unknown, out-of-scope, a box that moves mid-count) and the two
 * safety rules that don't show up in a happy-path run: self-approval is
 * blocked, and a posted session is locked.
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../src/config/database';
import * as stockReconService from '../../src/services/stockReconciliation.service';
import { packChildBox } from '../../src/services/masterCarton.service';
import { generateUniqueBarcode } from '../../src/utils/barcodeGenerator';
import { CHILD_BOX_STATUS } from '../../src/config/constants';

const TEST_PREFIX = 'ZJEST_STOCKRECON_';

describe('Stock reconciliation (integration)', () => {
  let userA: string; // opens + submits
  let userB: string; // approves + posts (must differ from userA)
  let createdUserB = false;
  let productId: string;
  let outOfScopeProductId: string;
  let cartonId: string;
  let cartonBarcode: string;
  let boxInCartonId: string;
  let looseFoundBoxId: string;
  let looseMissingBoxId: string;
  let outOfScopeBoxId: string;
  const sessionIds: string[] = [];

  beforeAll(async () => {
    const users = await query('SELECT id, role_id FROM users ORDER BY created_at LIMIT 2');
    if (users.rows.length === 0) throw new Error('No users in DB to attribute test actions to');
    userA = users.rows[0].id;
    if (users.rows.length >= 2) {
      userB = users.rows[1].id;
    } else {
      // Approver-differs-from-creator is a real business rule — this session
      // needs a genuinely second user, not a second reference to the same
      // one. Create a throwaway test user if the dev DB only has one.
      const created = await query(
        `INSERT INTO users (email, password_hash, name, role_id, is_active)
         VALUES ($1, 'x', $2, $3, true) RETURNING id`,
        [`${TEST_PREFIX.toLowerCase()}approver@example.com`, `${TEST_PREFIX}Approver`, users.rows[0].role_id]
      );
      userB = created.rows[0].id;
      createdUserB = true;
    }

    productId = uuidv4();
    await query(
      `INSERT INTO products (id, sku, article_name, article_code, colour, size, mrp, is_active, section, category, article_group, size_from, size_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [productId, `${TEST_PREFIX}SKU`, 'Stock Recon Test Article', 'SR01', 'BLACK', '8', 500.0, true, `${TEST_PREFIX}SECTION`, 'Gents', `${TEST_PREFIX}GROUP`, '6', '10']
    );
    outOfScopeProductId = uuidv4();
    await query(
      `INSERT INTO products (id, sku, article_name, article_code, colour, size, mrp, is_active, section, category, article_group, size_from, size_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [outOfScopeProductId, `${TEST_PREFIX}OOSSKU`, 'Out Of Scope Article', 'OOS01', 'RED', '9', 400.0, true, `${TEST_PREFIX}OTHERSECTION`, 'Ladies', 'OtherGroup', '6', '10']
    );

    cartonId = uuidv4();
    cartonBarcode = await generateUniqueBarcode('MC');
    await query(
      `INSERT INTO master_cartons (id, carton_barcode, status, max_capacity, child_count, created_by)
       VALUES ($1, $2, 'CREATED', 50, 0, $3)`,
      [cartonId, cartonBarcode, userA]
    );

    boxInCartonId = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity) VALUES ($1, $2, $3, 'FREE', 1)`,
      [boxInCartonId, await generateUniqueBarcode('CB'), productId]
    );
    await packChildBox(boxInCartonId, cartonId, userA);

    looseFoundBoxId = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity) VALUES ($1, $2, $3, 'FREE', 1)`,
      [looseFoundBoxId, await generateUniqueBarcode('CB'), productId]
    );

    looseMissingBoxId = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity) VALUES ($1, $2, $3, 'FREE', 1)`,
      [looseMissingBoxId, await generateUniqueBarcode('CB'), productId]
    );

    outOfScopeBoxId = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity) VALUES ($1, $2, $3, 'FREE', 1)`,
      [outOfScopeBoxId, await generateUniqueBarcode('CB'), outOfScopeProductId]
    );
  });

  afterAll(async () => {
    if (sessionIds.length > 0) {
      await query('DELETE FROM stock_reconciliation_sessions WHERE id = ANY($1::uuid[])', [sessionIds]);
    }
    await query('DELETE FROM inventory_transactions WHERE child_box_id = ANY($1::uuid[]) OR master_carton_id = $2', [
      [boxInCartonId, looseFoundBoxId, looseMissingBoxId, outOfScopeBoxId], cartonId,
    ]);
    await query('DELETE FROM carton_child_mapping WHERE master_carton_id = $1', [cartonId]);
    await query('DELETE FROM child_boxes WHERE id = ANY($1::uuid[])', [[boxInCartonId, looseFoundBoxId, looseMissingBoxId, outOfScopeBoxId]]);
    await query('DELETE FROM master_cartons WHERE id = $1', [cartonId]);
    await query('DELETE FROM products WHERE id = ANY($1::uuid[])', [[productId, outOfScopeProductId]]);
    if (createdUserB) {
      await query('DELETE FROM users WHERE id = $1', [userB]);
    }
  });

  it('runs the full open -> scan -> submit -> approve -> post chain', async () => {
    const session = await stockReconService.openSession(
      { scope: { section: `${TEST_PREFIX}SECTION` }, notes: 'jest' } as any,
      userA
    );
    sessionIds.push(session.id);

    // Expected snapshot should include the three in-scope boxes (two loose + one in a carton), not the out-of-scope one.
    const progressBefore = await stockReconService.getProgress(session.id);
    expect((progressBefore as any).expected_total).toBe(3);

    const cartonBox = await query('SELECT barcode FROM child_boxes WHERE id = $1', [boxInCartonId]);
    const looseFoundBox = await query('SELECT barcode FROM child_boxes WHERE id = $1', [looseFoundBoxId]);
    const outOfScopeBox = await query('SELECT barcode FROM child_boxes WHERE id = $1', [outOfScopeBoxId]);

    // Carton scan should auto-credit its contained box.
    const cartonScan = await stockReconService.submitScans(session.id, [
      { client_scan_id: 'c1', raw_payload: cartonBarcode, contents_mismatch: false, is_manual: false } as any,
    ], userA);
    expect(cartonScan.results[0].result).toBe('OK');
    expect(cartonScan.results[0].scan_type).toBe('CARTON');

    // Duplicate carton scan.
    const dupCartonScan = await stockReconService.submitScans(session.id, [
      { client_scan_id: 'c1b', raw_payload: cartonBarcode, contents_mismatch: false, is_manual: false } as any,
    ], userA);
    expect(dupCartonScan.results[0].result).toBe('DUPLICATE');

    // Loose found box.
    await stockReconService.submitScans(session.id, [
      { client_scan_id: 'c2', raw_payload: looseFoundBox.rows[0].barcode, contents_mismatch: false, is_manual: false } as any,
    ], userA);

    // Out-of-scope box (different section) should be flagged, not silently dropped.
    const oosScan = await stockReconService.submitScans(session.id, [
      { client_scan_id: 'c3', raw_payload: outOfScopeBox.rows[0].barcode, contents_mismatch: false, is_manual: false } as any,
    ], userA);
    expect(oosScan.results[0].result).toBe('OUT_OF_SCOPE');

    // Unknown code.
    const unknownScan = await stockReconService.submitScans(session.id, [
      { client_scan_id: 'c4', raw_payload: 'ZZNOTHING12345678', contents_mismatch: false, is_manual: false } as any,
    ], userA);
    expect(unknownScan.results[0].result).toBe('UNKNOWN');

    // Re-sending the exact same client_scan_id (offline resync) must not double-count.
    const replay = await stockReconService.submitScans(session.id, [
      { client_scan_id: 'c2', raw_payload: looseFoundBox.rows[0].barcode, contents_mismatch: false, is_manual: false } as any,
    ], userA);
    expect(replay.results[0].replayed).toBe(true);

    // Scan history must survive independently of the session ever being
    // submitted — this is what lets a counting screen reopened after a
    // crash/reload show what's already been scanned instead of losing it.
    const history = await stockReconService.getSessionScans(session.id, 1, 200);
    expect(history.total).toBeGreaterThanOrEqual(5); // c1, c1b, c2, c3, c4 (the c2 replay doesn't add a new row)
    const resolvedCodes = history.data.map((r: any) => r.resolved_code);
    expect(resolvedCodes).toContain(cartonBarcode);
    expect(resolvedCodes).toContain(looseFoundBox.rows[0].barcode);
    expect(resolvedCodes).toContain('ZZNOTHING12345678'); // unknown code falls back to raw_payload
    // Two scans share this carton's barcode (c1 = OK, c1b = DUPLICATE) — match
    // by client_scan_id, not barcode, to check the original scan specifically.
    const cartonRow = history.data.find((r: any) => r.client_scan_id === 'c1');
    expect(cartonRow?.result).toBe('OK');
    const dupCartonRow = history.data.find((r: any) => r.client_scan_id === 'c1b');
    expect(dupCartonRow?.result).toBe('DUPLICATE');

    // looseMissingBoxId is expected but never scanned -> should end up MISSING on post.
    const variance = await stockReconService.getVariance(session.id);
    expect((variance as any).missing_boxes.map((b: any) => b.id)).toContain(looseMissingBoxId);
    expect((variance as any).missing_boxes.map((b: any) => b.id)).not.toContain(boxInCartonId);
    expect((variance as any).missing_boxes.map((b: any) => b.id)).not.toContain(looseFoundBoxId);

    await stockReconService.submitSession(session.id, userA);

    await stockReconService.approveSession(session.id, userB);
    const posted = await stockReconService.postSession(session.id, userB);
    expect(posted.status).toBe('POSTED');
    expect((posted.summary as any).marked_missing_boxes).toBe(1);

    const missingBox = await query('SELECT status FROM child_boxes WHERE id = $1', [looseMissingBoxId]);
    expect(missingBox.rows[0].status).toBe('MISSING');

    const foundBoxes = await query('SELECT status FROM child_boxes WHERE id = ANY($1::uuid[])', [[boxInCartonId, looseFoundBoxId]]);
    expect(foundBoxes.rows.every((r: any) => r.status !== 'MISSING')).toBe(true);

    const txn = await query(
      `SELECT transaction_type FROM inventory_transactions WHERE child_box_id = $1 AND transaction_type = 'STOCK_RECON_MISSING'`,
      [looseMissingBoxId]
    );
    expect(txn.rows.length).toBe(1);

    const adjustment = await query(
      `SELECT action, old_status, new_status FROM stock_reconciliation_adjustments WHERE session_id = $1 AND child_box_id = $2`,
      [session.id, looseMissingBoxId]
    );
    expect(adjustment.rows[0]).toMatchObject({ action: 'MARKED_MISSING', old_status: 'FREE', new_status: 'MISSING' });

    // Posted session is locked: no more scans, no double-post.
    await expect(
      stockReconService.submitScans(session.id, [{ client_scan_id: 'c5', raw_payload: cartonBarcode } as any], userA)
    ).rejects.toThrow(/only be submitted while COUNTING/);
    await expect(stockReconService.postSession(session.id, userB)).rejects.toThrow(/requires status APPROVED/);
  });

  it('skips a box that moved status since the snapshot instead of overwriting it', async () => {
    // Own product/section so this session's snapshot doesn't re-touch the
    // boxes already asserted on in the previous test.
    const movedProductId = uuidv4();
    await query(
      `INSERT INTO products (id, sku, article_name, article_code, colour, size, mrp, is_active, section, category, article_group, size_from, size_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [movedProductId, `${TEST_PREFIX}MOVEDSKU`, 'Moved Box Test Article', 'MV01', 'BLUE', '8', 500.0, true, `${TEST_PREFIX}MOVEDSECTION`, 'Boys', `${TEST_PREFIX}GROUP`, '6', '10']
    );

    const movedBoxId = uuidv4();
    const movedBoxBarcode = await generateUniqueBarcode('CB');
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity) VALUES ($1, $2, $3, 'FREE', 1)`,
      [movedBoxId, movedBoxBarcode, movedProductId]
    );

    const session = await stockReconService.openSession(
      { scope: { section: `${TEST_PREFIX}MOVEDSECTION` } } as any,
      userA
    );
    sessionIds.push(session.id);

    const progress = await stockReconService.getProgress(session.id);
    expect((progress as any).expected_total).toBe(1);

    // Box moves to a different status after the snapshot was taken, without being scanned.
    await query(`UPDATE child_boxes SET status = 'ECOMMERCE', updated_at = NOW() WHERE id = $1`, [movedBoxId]);

    await stockReconService.submitSession(session.id, userA);
    await stockReconService.approveSession(session.id, userB);
    const posted = await stockReconService.postSession(session.id, userB);

    expect((posted.summary as any).skipped_moved).toBeGreaterThanOrEqual(1);
    const stillEcom = await query('SELECT status FROM child_boxes WHERE id = $1', [movedBoxId]);
    expect(stillEcom.rows[0].status).toBe('ECOMMERCE');

    const adjustment = await query(
      `SELECT action FROM stock_reconciliation_adjustments WHERE session_id = $1 AND child_box_id = $2`,
      [session.id, movedBoxId]
    );
    expect(adjustment.rows[0].action).toBe('SKIPPED_MOVED');

    await query('DELETE FROM child_boxes WHERE id = $1', [movedBoxId]);
    await query('DELETE FROM products WHERE id = $1', [movedProductId]);
  });

  // -------------------------------------------------------------------------
  // Stock-verification fixes from the 2026-10-03 meeting.
  // -------------------------------------------------------------------------
  async function makeProduct(tag: string, section: string): Promise<string> {
    const id = uuidv4();
    await query(
      `INSERT INTO products (id, sku, article_name, article_code, colour, size, mrp, is_active, section, category, article_group, size_from, size_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, `${TEST_PREFIX}${tag}SKU`, `Recon ${tag}`, tag.slice(0, 6), 'BLACK', '8', 500.0, true, section, 'Gents', `${TEST_PREFIX}GROUP`, '6', '10']
    );
    return id;
  }
  async function makeBox(productId: string, status: string): Promise<string> {
    const id = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity) VALUES ($1, $2, $3, $4, 1)`,
      [id, await generateUniqueBarcode('CB'), productId, status]
    );
    return id;
  }
  async function cleanupFixture(opts: { boxIds: string[]; cartonIds?: string[]; productId: string }): Promise<void> {
    const cartons = opts.cartonIds ?? [];
    await query('DELETE FROM inventory_transactions WHERE child_box_id = ANY($1::uuid[]) OR master_carton_id = ANY($2::uuid[])', [opts.boxIds, cartons]);
    await query('DELETE FROM carton_child_mapping WHERE master_carton_id = ANY($1::uuid[]) OR child_box_id = ANY($2::uuid[])', [cartons, opts.boxIds]);
    await query('DELETE FROM stock_reconciliation_sessions WHERE id = ANY($1::uuid[])', [sessionIds]);
    await query('DELETE FROM child_boxes WHERE id = ANY($1::uuid[])', [opts.boxIds]);
    await query('DELETE FROM master_cartons WHERE id = ANY($1::uuid[])', [cartons]);
    await query('DELETE FROM products WHERE id = $1', [opts.productId]);
    sessionIds.length = 0;
  }

  it('credits a carton that boxes were packed into AFTER the session opened (not "not expected")', async () => {
    const section = `${TEST_PREFIX}PACKLATE`;
    const productId2 = await makeProduct('PACKL', section);
    const boxA = await makeBox(productId2, 'FREE');
    const boxB = await makeBox(productId2, 'FREE');

    const session = await stockReconService.openSession({ scope: { section } } as any, userA);
    sessionIds.push(session.id);

    // Loose boxes get packed into a brand-new carton while the count is running.
    const lateCartonId = uuidv4();
    const lateCartonBarcode = await generateUniqueBarcode('MC');
    await query(
      `INSERT INTO master_cartons (id, carton_barcode, status, max_capacity, child_count, created_by)
       VALUES ($1, $2, 'CREATED', 50, 0, $3)`,
      [lateCartonId, lateCartonBarcode, userA]
    );
    await packChildBox(boxA, lateCartonId, userA);
    await packChildBox(boxB, lateCartonId, userA);

    const scan = await stockReconService.submitScans(session.id, [
      { client_scan_id: 'late1', raw_payload: lateCartonBarcode, contents_mismatch: false, is_manual: false } as any,
    ], userA);
    expect(scan.results[0].result).toBe('OK');

    const progress: any = await stockReconService.getProgress(session.id);
    expect(progress.found_total).toBe(2);
    const variance: any = await stockReconService.getVariance(session.id);
    expect(variance.missing_boxes).toHaveLength(0);

    await cleanupFixture({ boxIds: [boxA, boxB], cartonIds: [lateCartonId], productId: productId2 });
  });

  it('keeps e-commerce and sample stock out of the snapshot and reports their scans as out of scope', async () => {
    const section = `${TEST_PREFIX}CHANNELS`;
    const productId3 = await makeProduct('CHAN', section);
    const warehouseBox = await makeBox(productId3, 'FREE');
    const ecomBox = await makeBox(productId3, 'ECOMMERCE');
    const sampleBox = await makeBox(productId3, 'SAMPLE');

    const session = await stockReconService.openSession({ scope: { section } } as any, userA);
    sessionIds.push(session.id);

    const progress: any = await stockReconService.getProgress(session.id);
    expect(progress.expected_total).toBe(1);

    const codes = await query('SELECT id, barcode FROM child_boxes WHERE id = ANY($1::uuid[])', [[ecomBox, sampleBox]]);
    const scan = await stockReconService.submitScans(session.id, codes.rows.map((r: any, i: number) => ({
      client_scan_id: `ch${i}`, raw_payload: r.barcode, contents_mismatch: false, is_manual: false,
    })) as any, userA);
    expect(scan.results.map((r: any) => r.result)).toEqual(['OUT_OF_SCOPE', 'OUT_OF_SCOPE']);

    // Only the warehouse box can ever be reported missing.
    const variance: any = await stockReconService.getVariance(session.id);
    expect(variance.missing_boxes.map((b: any) => b.id)).toEqual([warehouseBox]);

    await cleanupFixture({ boxIds: [warehouseBox, ecomBox, sampleBox], productId: productId3 });
  });

  it('lets Admin approve a count they opened/submitted, but still blocks other roles', async () => {
    const roles = await query(`SELECT id, name FROM roles WHERE name IN ('Admin', 'Supervisor')`);
    const adminRole = roles.rows.find((r: any) => r.name === 'Admin');
    const otherRole = roles.rows.find((r: any) => r.name === 'Supervisor');
    if (!adminRole || !otherRole) throw new Error('Admin/Supervisor roles missing in dev DB');

    const mkUser = async (roleId: string, tag: string) => (await query(
      `INSERT INTO users (email, password_hash, name, role_id, is_active) VALUES ($1, 'x', $2, $3, true) RETURNING id`,
      [`${TEST_PREFIX.toLowerCase()}${tag}@example.com`, `${TEST_PREFIX}${tag}`, roleId]
    )).rows[0].id as string;
    const adminUser = await mkUser(adminRole.id, 'adm');
    const otherUser = await mkUser(otherRole.id, 'sup');

    try {
      const section = `${TEST_PREFIX}APPROVAL`;
      const productId4 = await makeProduct('APPR', section);
      const box = await makeBox(productId4, 'FREE');

      const mkSubmitted = async (userId: string) => {
        const s = await stockReconService.openSession({ scope: { section } } as any, userId);
        sessionIds.push(s.id);
        await stockReconService.submitSession(s.id, userId);
        return s;
      };

      const own = await mkSubmitted(otherUser);
      await expect(stockReconService.approveSession(own.id, otherUser)).rejects.toThrow(/different user must approve/);

      const adminOwn = await mkSubmitted(adminUser);
      const approved = await stockReconService.approveSession(adminOwn.id, adminUser);
      expect(approved.status).toBe('APPROVED');

      await cleanupFixture({ boxIds: [box], productId: productId4 });
    } finally {
      await query('DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])', [[adminUser, otherUser]]).catch(() => undefined);
      await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[adminUser, otherUser]]);
    }
  });
});
