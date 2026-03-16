import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../config/database';
import { ChildBox } from '../types';
import { CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError } from '../utils/errors';
import { generateChildBoxQR } from '../utils/qrGenerator';
import { createAuditLog } from './auditLog.service';
import { CreateChildBoxInput, CreateBulkChildBoxInput } from '../models/schemas/childBox.schema';
import { logger } from '../utils/logger';

export async function createChildBox(
  input: CreateChildBoxInput,
  createdBy: string
): Promise<ChildBox & { qr_data_uri: string; product_name: string; product_sku: string; size: string; colour: string }> {
  // Verify product exists
  const productResult = await query(
    'SELECT id, article_name, sku, size, colour, mrp FROM products WHERE id = $1 AND is_active = true',
    [input.product_id]
  );
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found or inactive');
  }

  const product = productResult.rows[0];
  const id = uuidv4();
  const barcode = `BINNY-CB-${id}`;
  const qrDataUri = await generateChildBoxQR(id);

  const result = await query(
    `INSERT INTO child_boxes (id, barcode, product_id, quantity, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      id, barcode, product.id, input.quantity, CHILD_BOX_STATUS.FREE, createdBy,
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
    product_name: product.article_name,
    product_sku: product.sku,
    size: product.size,
    colour: product.colour,
  };
}

export async function createBulkChildBoxes(
  input: CreateBulkChildBoxInput,
  createdBy: string
): Promise<Array<ChildBox & { qr_data_uri: string; product_name: string; product_sku: string; size: string; colour: string }>> {
  const productResult = await query(
    'SELECT id, article_name, sku, size, colour, mrp FROM products WHERE id = $1 AND is_active = true',
    [input.product_id]
  );
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found or inactive');
  }

  const product = productResult.rows[0];
  const client = await getClient();
  const childBoxes: Array<ChildBox & { qr_data_uri: string; product_name: string; product_sku: string; size: string; colour: string }> = [];

  try {
    await client.query('BEGIN');

    for (let i = 0; i < input.count; i++) {
      const id = uuidv4();
      const barcode = `BINNY-CB-${id}`;
      const qrDataUri = await generateChildBoxQR(id);

      const result = await client.query(
        `INSERT INTO child_boxes (id, barcode, product_id, quantity, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id, barcode, product.id, input.quantity, CHILD_BOX_STATUS.FREE, createdBy,
        ]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [TRANSACTION_TYPES.CHILD_CREATED, id, createdBy, `Bulk child box created with barcode ${barcode}`]
      );

      childBoxes.push({
        ...result.rows[0],
        qr_data_uri: qrDataUri,
        product_name: product.article_name,
        product_sku: product.sku,
        size: product.size,
        colour: product.colour,
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

export async function getChildBoxById(id: string): Promise<ChildBox & { product_name: string; product_sku: string; size: string; colour: string }> {
  const result = await query(
    `SELECT cb.*, p.article_name as product_name, p.sku as product_sku, p.size, p.colour
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
    `SELECT cb.*, p.article_name as product_name, p.sku as product_sku, p.size, p.colour
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     WHERE cb.barcode = $1`,
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
    `SELECT cb.*, p.article_name as product_name, p.sku as product_sku, p.size, p.colour
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     ${whereClause}
     ORDER BY cb.created_at DESC
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
    `SELECT cb.*, p.article_name as product_name, p.sku as product_sku, p.size, p.colour
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     ${whereClause}
     ORDER BY cb.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}
