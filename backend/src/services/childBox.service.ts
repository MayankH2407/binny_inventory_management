import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../config/database';
import { ChildBox } from '../types';
import { CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors';
import { generateChildBoxQR } from '../utils/qrGenerator';
import { createAuditLog } from './auditLog.service';
import { CreateChildBoxInput, CreateBulkChildBoxInput, CreateBulkMultiSizeChildBoxInput, bulkUploadChildBoxRowSchema } from '../models/schemas/childBox.schema';
import { logger } from '../utils/logger';
import { parse } from 'csv-parse/sync';
import { generateUniqueBarcode, generateUniqueBarcodes } from '../utils/barcodeGenerator';

export async function createChildBox(
  input: CreateChildBoxInput,
  createdBy: string
): Promise<ChildBox & { qr_data_uri: string; article_name: string; product_sku: string; size: string; colour: string }> {
  // Verify product exists
  const productResult = await query(
    'SELECT id, article_name, article_code, sku, size, colour, mrp FROM products WHERE id = $1 AND is_active = true',
    [input.product_id]
  );
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found or inactive');
  }

  const product = productResult.rows[0];
  const id = uuidv4();
  const barcode = await generateUniqueBarcode('CB');
  const qrDataUri = await generateChildBoxQR(id);

  const result = await query(
    `INSERT INTO child_boxes (id, barcode, product_id, quantity, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      id, barcode, product.id, input.quantity, CHILD_BOX_STATUS.GENERATED, createdBy,
    ]
  );

  // Log child created transaction
  await query(
    `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [TRANSACTION_TYPES.CHILD_CREATED, id, createdBy, `Child box created with barcode ${barcode}`]
  );

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_CHILD_BOX',
    entityType: 'child_box',
    entityId: id,
    newValues: { product_id: input.product_id, quantity: input.quantity, barcode },
  });

  logger.info(`Child box created: ${barcode}`);
  return {
    ...result.rows[0],
    qr_data_uri: qrDataUri,
    article_name: product.article_name,
    article_code: product.article_code,
    product_sku: product.sku,
    size: product.size,
    colour: product.colour,
    mrp: product.mrp,
  };
}

export async function createBulkChildBoxes(
  input: CreateBulkChildBoxInput,
  createdBy: string
): Promise<Array<ChildBox & { qr_data_uri: string; article_name: string; product_sku: string; size: string; colour: string }>> {
  const productResult = await query(
    'SELECT id, article_name, article_code, sku, size, colour, mrp FROM products WHERE id = $1 AND is_active = true',
    [input.product_id]
  );
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found or inactive');
  }

  const product = productResult.rows[0];
  const client = await getClient();
  const childBoxes: Array<ChildBox & { qr_data_uri: string; article_name: string; product_sku: string; size: string; colour: string }> = [];

  try {
    await client.query('BEGIN');

    for (let i = 0; i < input.count; i++) {
      const id = uuidv4();
      const barcode = await generateUniqueBarcode('CB', client);
      const qrDataUri = await generateChildBoxQR(id);

      const result = await client.query(
        `INSERT INTO child_boxes (id, barcode, product_id, quantity, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id, barcode, product.id, input.quantity, CHILD_BOX_STATUS.GENERATED, createdBy,
        ]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [TRANSACTION_TYPES.CHILD_CREATED, id, createdBy, `Bulk child box generated (label printed) with barcode ${barcode}`]
      );

      childBoxes.push({
        ...result.rows[0],
        qr_data_uri: qrDataUri,
        article_name: product.article_name,
        article_code: product.article_code,
        product_sku: product.sku,
        size: product.size,
        colour: product.colour,
        mrp: product.mrp,
      });
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId: createdBy,
      action: 'BULK_CREATE_CHILD_BOX',
      entityType: 'child_box',
      newValues: { product_id: input.product_id, quantity: input.quantity, count: input.count },
    });

    logger.info(`Bulk created ${input.count} child boxes for product ${product.sku}`);
    return childBoxes;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createBulkMultiSizeChildBoxes(
  input: CreateBulkMultiSizeChildBoxInput,
  createdBy: string
): Promise<Array<ChildBox & { qr_data_uri: string; article_name: string; product_sku: string; size: string; colour: string }>> {
  // Get the base product to find article_name and colour
  const baseProductResult = await query(
    'SELECT id, article_name, colour FROM products WHERE id = $1 AND is_active = true',
    [input.product_id]
  );
  if (baseProductResult.rows.length === 0) {
    throw new NotFoundError('Product not found or inactive');
  }

  const baseProduct = baseProductResult.rows[0];

  // Find all sibling products (same article_name + colour) and index by size
  const siblingsResult = await query(
    `SELECT id, article_name, article_code, sku, size, colour, mrp FROM products
     WHERE article_name = $1 AND colour = $2 AND is_active = true`,
    [baseProduct.article_name, baseProduct.colour]
  );
  const productBySize = new Map<string, typeof siblingsResult.rows[0]>();
  for (const row of siblingsResult.rows) {
    productBySize.set(row.size, row);
  }

  // Validate all requested sizes exist
  for (const sizeEntry of input.sizes) {
    if (!productBySize.has(sizeEntry.size)) {
      throw new NotFoundError(`No product found for size "${sizeEntry.size}" with article "${baseProduct.article_name}" and colour "${baseProduct.colour}"`);
    }
  }

  // Calculate total count for validation
  const totalCount = input.sizes.reduce((sum, s) => sum + s.count, 0);
  // Env-driven cap: default 500 (test/local); live sets CHILD_BOX_MAX_PER_GENERATION=1500.
  const maxLabels = Number(process.env.CHILD_BOX_MAX_PER_GENERATION) || 500;
  if (totalCount > maxLabels) {
    throw new BadRequestError(`Total count across all sizes must not exceed ${maxLabels}`);
  }

  const client = await getClient();
  const childBoxes: Array<ChildBox & { qr_data_uri: string; article_name: string; product_sku: string; size: string; colour: string }> = [];

  try {
    await client.query('BEGIN');

    const flat: typeof siblingsResult.rows = [];
    for (const sizeEntry of input.sizes) {
      const product = productBySize.get(sizeEntry.size)!;
      for (let i = 0; i < sizeEntry.count; i++) flat.push(product);
    }

    const ids = flat.map(() => uuidv4());
    const barcodes = await generateUniqueBarcodes('CB', flat.length, client);

    const cbValues: unknown[] = [];
    const cbPlaceholders = flat.map((product, idx) => {
      const b = idx * 6;
      cbValues.push(ids[idx], barcodes[idx], product.id, input.quantity, CHILD_BOX_STATUS.GENERATED, createdBy);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    });
    const insertResult = await client.query(
      `INSERT INTO child_boxes (id, barcode, product_id, quantity, status, created_by)
       VALUES ${cbPlaceholders.join(', ')} RETURNING *`,
      cbValues
    );
    const rowById = new Map<string, typeof insertResult.rows[0]>(
      insertResult.rows.map((r: { id: string }) => [r.id, r])
    );

    const txValues: unknown[] = [];
    const txPlaceholders = flat.map((_product, idx) => {
      const b = idx * 4;
      txValues.push(TRANSACTION_TYPES.CHILD_CREATED, ids[idx], createdBy, `Multi-size bulk child box generated (label printed) with barcode ${barcodes[idx]}`);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
    });
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
       VALUES ${txPlaceholders.join(', ')}`,
      txValues
    );

    for (let idx = 0; idx < flat.length; idx++) {
      const product = flat[idx];
      const row = rowById.get(ids[idx])!;
      childBoxes.push({
        ...row,
        qr_data_uri: '',
        article_name: product.article_name,
        article_code: product.article_code,
        product_sku: product.sku,
        size: product.size,
        colour: product.colour,
        mrp: product.mrp,
      });
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId: createdBy,
      action: 'BULK_MULTI_SIZE_CREATE_CHILD_BOX',
      entityType: 'child_box',
      newValues: {
        product_id: input.product_id,
        quantity: input.quantity,
        sizes: input.sizes,
        total_count: totalCount,
      },
    });

    logger.info(`Multi-size bulk created ${totalCount} child boxes for article ${baseProduct.article_name}`);
    return childBoxes;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getChildBoxById(id: string): Promise<ChildBox & { product_name: string; product_sku: string; size: string; colour: string }> {
  const result = await query(
    `SELECT cb.*, p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     WHERE cb.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Child box not found');
  }
  return result.rows[0];
}

export async function getChildBoxByQR(barcode: string): Promise<ChildBox & { product_name: string; product_sku: string; size: string; colour: string }> {
  const result = await query(
    `SELECT cb.*, p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp,
            COALESCE(ARRAY(
              SELECT sbm.foot FROM sample_box_mapping sbm
              WHERE sbm.child_box_id = cb.id AND sbm.is_active = true
            ), '{}') AS active_sample_feet
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     WHERE cb.barcode = UPPER($1)`,
    [barcode]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Child box not found for this QR code');
  }
  return result.rows[0];
}

export async function getChildBoxes(
  filters: {
    status?: string;
    product_id?: string;
    search?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: Array<ChildBox & { product_name: string; product_sku: string; size: string; colour: string }>; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`cb.status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.product_id) {
    conditions.push(`cb.product_id = $${paramIndex++}`);
    values.push(filters.product_id);
  }
  if (filters.search) {
    conditions.push(`(cb.barcode ILIKE $${paramIndex} OR p.article_name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM child_boxes cb JOIN products p ON p.id = cb.product_id ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT cb.*, p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     ${whereClause}
     ORDER BY cb.created_at DESC, cb.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function updateChildBoxStatus(
  id: string,
  status: string
): Promise<ChildBox> {
  const result = await query(
    `UPDATE child_boxes SET status = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Child box not found');
  }

  return result.rows[0];
}

export async function bulkUploadChildBoxesFromCSV(
  csvBuffer: Buffer,
  createdBy: string
): Promise<{
  totalRows: number;
  created: number;
  errors: Array<{ row: number; sku?: string; error: string }>;
  createdBarcodes: string[];
}> {
  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch {
    throw new ConflictError('Invalid CSV format. Please ensure the file is a valid CSV with headers.');
  }

  if (records.length === 0) {
    throw new ConflictError('CSV file is empty. Please add child box rows below the header.');
  }

  if (records.length > 1000) {
    throw new ConflictError('Maximum 1000 rows per upload');
  }

  const headerKeys = Object.keys(records[0]).map((h) => h.toLowerCase().trim());
  const requiredCols = ['sku', 'count'];
  const missingCols = requiredCols.filter((c) => !headerKeys.includes(c));
  if (missingCols.length > 0) {
    throw new ConflictError(`Missing required columns: ${missingCols.join(', ')}`);
  }

  // Pre-validate total box count before any inserts
  let totalBoxCount = 0;
  for (const record of records) {
    const raw: Record<string, string> = {};
    for (const [key, val] of Object.entries(record)) {
      raw[key.toLowerCase().trim()] = val;
    }
    const n = parseInt(raw['count'], 10);
    if (!isNaN(n)) totalBoxCount += n;
  }
  if (totalBoxCount > 5000) {
    throw new ConflictError('Total boxes across all rows must not exceed 5000');
  }

  const errors: Array<{ row: number; sku?: string; error: string }> = [];
  const createdBarcodes: string[] = [];
  let created = 0;

  for (let i = 0; i < records.length; i++) {
    const rawRecord = records[i];
    const rowNum = i + 1; // row 1 = first data row (after header)

    // Normalize keys to lowercase
    const raw: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawRecord)) {
      raw[key.toLowerCase().trim()] = val;
    }

    const parsed = bulkUploadChildBoxRowSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join('; ');
      errors.push({ row: rowNum, sku: raw['sku'] || undefined, error: msg });
      continue;
    }

    const { sku, quantity, count } = parsed.data;

    // Look up product by SKU
    let product: { id: string; is_active: boolean; sku: string } | null = null;
    try {
      const productResult = await query(
        'SELECT id, is_active, sku FROM products WHERE sku = $1',
        [sku]
      );
      if (productResult.rows.length === 0) {
        errors.push({ row: rowNum, sku, error: `Product with SKU "${sku}" not found` });
        continue;
      }
      product = productResult.rows[0];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: rowNum, sku, error: message });
      continue;
    }

    if (!product!.is_active) {
      errors.push({ row: rowNum, sku, error: `Product "${sku}" is inactive` });
      continue;
    }

    // Insert all boxes for this row in a single transaction
    const client = await getClient();
    const rowBarcodes: string[] = [];
    try {
      await client.query('BEGIN');

      for (let j = 0; j < count; j++) {
        const id = uuidv4();
        const barcode = await generateUniqueBarcode('CB', client);
        const qrDataUri = await generateChildBoxQR(id);

        await client.query(
          `INSERT INTO child_boxes (id, barcode, product_id, quantity, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, barcode, product!.id, quantity, CHILD_BOX_STATUS.GENERATED, createdBy]
        );

        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
           VALUES ($1, $2, $3, $4)`,
          [TRANSACTION_TYPES.CHILD_CREATED, id, createdBy, `CSV bulk import: child box generated (label printed) with barcode ${barcode}`]
        );

        rowBarcodes.push(barcode);

        await createAuditLog({
          userId: createdBy,
          action: 'CREATE_CHILD_BOX',
          entityType: 'child_box',
          entityId: id,
          newValues: { product_id: product!.id, sku, quantity, barcode, source: 'csv_bulk_upload' },
        });

        void qrDataUri; // QR generated but not returned in bulk CSV upload
      }

      await client.query('COMMIT');
      createdBarcodes.push(...rowBarcodes);
      created += count;
    } catch (err) {
      await client.query('ROLLBACK');
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: rowNum, sku, error: message });
    } finally {
      client.release();
    }
  }

  logger.info(`CSV bulk child-box upload: ${created} created, ${errors.length} errors`);
  return { totalRows: records.length, created, errors, createdBarcodes };
}

export async function logChildBoxReprints(
  barcodes: string[],
  performedBy: string
): Promise<{ logged: number }> {
  const normalized = [...new Set((barcodes || []).map((b) => b.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0) return { logged: 0 };
  const rows = (await query(
    `SELECT cb.id, cb.barcode, cb.status, mc.carton_barcode AS carton
     FROM child_boxes cb
     LEFT JOIN carton_child_mapping ccm ON ccm.child_box_id = cb.id AND ccm.is_active = true
     LEFT JOIN master_cartons mc ON mc.id = ccm.master_carton_id
     WHERE cb.barcode = ANY($1::text[])`,
    [normalized]
  )).rows as Array<{ id: string; barcode: string; status: string; carton: string | null }>;
  if (rows.length === 0) return { logged: 0 };
  const values: unknown[] = [];
  const placeholders = rows.map((r, i) => {
    const b = i * 4;
    const note = `Label reprinted for ${r.barcode} (status: ${r.status}${r.carton ? `, in carton ${r.carton}` : ''})`;
    values.push(TRANSACTION_TYPES.CHILD_LABEL_REPRINTED, r.id, performedBy, note);
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
  });
  await query(
    `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
     VALUES ${placeholders.join(', ')}`,
    values
  );
  return { logged: rows.length };
}

export async function activateChildBox(
  id: string,
  activatedBy: string
): Promise<ChildBox & { product_name: string; product_sku: string; size: string; colour: string }> {
  // Look up the box first (outside transaction — read-only check)
  const box = await getChildBoxById(id);

  if (box.status === CHILD_BOX_STATUS.FREE) {
    // Already active — idempotent no-op
    return box;
  }

  if (box.status === CHILD_BOX_STATUS.PACKED || box.status === CHILD_BOX_STATUS.DISPATCHED) {
    throw new ConflictError(`Cannot activate child box in ${box.status} status`);
  }

  // Status is GENERATED — activate it
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [CHILD_BOX_STATUS.FREE, id]
    );

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [TRANSACTION_TYPES.CHILD_ACTIVATED, id, activatedBy, `Child box activated (label scanned, now real inventory): ${box.barcode}`]
    );

    await createAuditLog({
      userId: activatedBy,
      action: 'ACTIVATE_CHILD_BOX',
      entityType: 'child_box',
      entityId: id,
      oldValues: { status: CHILD_BOX_STATUS.GENERATED },
      newValues: { status: CHILD_BOX_STATUS.FREE },
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  logger.info(`Child box activated: ${box.barcode}`);
  return getChildBoxById(id);
}

export async function getFreeChildBoxes(
  productId?: string,
  page: number = 1,
  limit: number = 25
): Promise<{ data: Array<ChildBox & { product_name: string; product_sku: string; size: string; colour: string }>; total: number }> {
  const conditions: string[] = [`cb.status = $1`];
  const values: unknown[] = [CHILD_BOX_STATUS.FREE];
  let paramIndex = 2;

  if (productId) {
    conditions.push(`cb.product_id = $${paramIndex++}`);
    values.push(productId);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `SELECT COUNT(*) FROM child_boxes cb JOIN products p ON p.id = cb.product_id ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT cb.*, p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     ${whereClause}
     ORDER BY cb.created_at DESC, cb.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}
