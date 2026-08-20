import { query, pool } from '../config/database';
import { Product } from '../types';
import { ConflictError, NotFoundError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateProductInput, UpdateProductInput, BulkCreateBySizeRangeInput } from '../models/schemas/product.schema';
import { logger } from '../utils/logger';
import { generateSku } from '../utils/skuGenerator';
import { parse } from 'csv-parse/sync';

/** Strip all HTML tags from a user-supplied free-text string to prevent XSS storage. */
function stripHtml(value: string | undefined | null): string | undefined {
  if (value == null) return value as undefined;
  return value.replace(/<[^>]*>/g, '').trim();
}

/**
 * Title-case a name-like field for uniform display, regardless of how it was entered.
 * "ALIA PLUS" / "alia plus" / "Alia plus" all become "Alia Plus". Collapses runs of
 * whitespace to a single space. Applied to name fields only (article_name, colour,
 * section, article_group) — NOT to codes/acronyms (article_code, location, hsn_code).
 */
function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/**
 * Uppercase a name field: trim + collapse whitespace + UPPERCASE.
 * `article_name` is stored UPPERCASE per client requirement (2026-07-03) — this
 * replaced the earlier Title-Case treatment, whose "going-forward-only" rollout
 * had left the catalog split across casings and duplicated articles in the
 * QR-create dropdown / inventory grouping. (colour/section/article_group remain
 * Title Case; category is a fixed enum; codes are uppercased separately.)
 */
function toUpperName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Resolve a category to its canonical casing (case-insensitive); undefined if not a valid category. */
function canonicalCategory(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  return VALID_CATEGORIES.find((c) => c.toLowerCase() === v);
}

/** Resolve a location code to its canonical casing (case-insensitive); undefined if not a valid location. */
function canonicalLocation(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  return VALID_LOCATIONS.find((l) => l.toLowerCase() === v);
}

export async function createProduct(
  input: CreateProductInput,
  createdBy: string
): Promise<Product> {
  input.article_name = toUpperName(stripHtml(input.article_name) ?? input.article_name);
  input.colour = toUpperName(input.colour);
  input.section = toTitleCase(input.section);
  input.article_code = input.article_code.trim().toUpperCase();
  if (input.article_group) input.article_group = toTitleCase(input.article_group);
  if (input.description) input.description = stripHtml(input.description);

  // Reject an exact-variant duplicate up front: identity = section + article +
  // category + colour + size (case-insensitive). Prevents adding a second row
  // for a product that already exists (which would only differ by SKU serial).
  const variantDup = await query(
    `SELECT 1 FROM products
     WHERE UPPER(REPLACE(section, ' ', '-'))      = UPPER(REPLACE($1, ' ', '-'))
       AND UPPER(REPLACE(article_name, ' ', '-')) = UPPER(REPLACE($2, ' ', '-'))
       AND UPPER(REPLACE(category, ' ', '-'))     = UPPER(REPLACE($3, ' ', '-'))
       AND UPPER(REPLACE(colour, ' ', '-'))       = UPPER(REPLACE($4, ' ', '-'))
       AND UPPER(size)                            = UPPER($5)
     LIMIT 1`,
    [input.section, input.article_name, input.category, input.colour, input.size]
  );
  if (variantDup.rows.length > 0) {
    throw new ConflictError(`Product already exists: ${input.article_name} / ${input.colour} / size ${input.size}`);
  }

  const sku = await generateSku(input.section, input.article_name, input.category, input.colour);

  const existing = await query('SELECT id FROM products WHERE sku = $1', [sku]);
  if (existing.rows.length > 0) {
    throw new ConflictError(`Product with SKU ${sku} already exists`);
  }

  const result = await query(
    `INSERT INTO products (article_name, sku, article_code, colour, size, mrp, description, category, section, location, article_group, hsn_code, size_from, size_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      input.article_name, sku, input.article_code, input.colour, input.size, input.mrp, input.description || null,
      input.category, input.section, input.location || null,
      input.article_group || null, input.hsn_code || null, input.size_from || null, input.size_to || null,
    ]
  );

  const product: Product = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_PRODUCT',
    entityType: 'product',
    entityId: product.id,
    newValues: { ...input, sku } as Record<string, unknown>,
  });

  logger.info(`Product created: ${input.article_name} (${sku})`);
  return product;
}

export async function getProductById(id: string): Promise<Product> {
  const result = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  return result.rows[0];
}

export async function getProducts(
  filters: {
    article_code?: string;
    search?: string;
    is_active?: boolean;
    category?: string;
    section?: string;
    location?: string;
    colour?: string;
    size?: string;
    article_name?: string;
    article_group?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: Product[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.article_code) {
    conditions.push(`article_code = $${paramIndex++}`);
    values.push(filters.article_code);
  }
  if (filters.is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    values.push(filters.is_active);
  }
  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    values.push(filters.category);
  }
  if (filters.section) {
    conditions.push(`section = $${paramIndex++}`);
    values.push(filters.section);
  }
  if (filters.location) {
    conditions.push(`location = $${paramIndex++}`);
    values.push(filters.location);
  }
  if (filters.colour) {
    conditions.push(`colour ILIKE $${paramIndex++}`);
    values.push(`%${filters.colour}%`);
  }
  if (filters.size) {
    conditions.push(`size = $${paramIndex++}`);
    values.push(filters.size);
  }
  if (filters.article_name) {
    conditions.push(`article_name ILIKE $${paramIndex++}`);
    values.push(`%${filters.article_name}%`);
  }
  if (filters.article_group) {
    conditions.push(`article_group ILIKE $${paramIndex++}`);
    values.push(`%${filters.article_group}%`);
  }
  if (filters.search) {
    conditions.push(`(article_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR article_code ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM products ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT * FROM products ${whereClause}
     ORDER BY created_at DESC, id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

/**
 * Distinct active articles for dropdown use (e.g. child-box generate page). A
 * "product" row is one size/colour variant, so the catalog has thousands of
 * rows but only a few dozen distinct articles; this returns one representative
 * product id per article_name (case-insensitive) instead of making callers
 * load every variant row just to dedupe client-side.
 */
export async function getDistinctArticles(
  search?: string
): Promise<{ id: string; article_name: string; article_code: string | null; section: string | null }[]> {
  const conditions = ['is_active = true'];
  const values: unknown[] = [];

  if (search) {
    conditions.push('(article_name ILIKE $1 OR article_code ILIKE $1)');
    values.push(`%${search}%`);
  }

  const result = await query(
    `SELECT DISTINCT ON (LOWER(article_name)) id, article_name, article_code, section
     FROM products
     WHERE ${conditions.join(' AND ')}
     ORDER BY LOWER(article_name), id`,
    values
  );
  return result.rows;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  updatedBy: string
): Promise<Product> {
  const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }

  const oldProduct: Product = existing.rows[0];

  if (input.sku && input.sku !== oldProduct.sku) {
    const skuCheck = await query('SELECT id FROM products WHERE sku = $1 AND id != $2', [input.sku, id]);
    if (skuCheck.rows.length > 0) {
      throw new ConflictError(`Product with SKU ${input.sku} already exists`);
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const updateableFields: (keyof UpdateProductInput)[] = [
    'article_name', 'sku', 'article_code', 'colour', 'size', 'mrp', 'description', 'is_active',
    'category', 'section', 'location', 'article_group', 'hsn_code', 'size_from', 'size_to',
  ];

  for (const field of updateableFields) {
    if (input[field] !== undefined) {
      fields.push(`${field} = $${paramIndex++}`);
      const raw = input[field];
      if (typeof raw === 'string') {
        if (field === 'article_name') values.push(toUpperName(stripHtml(raw) ?? raw));
        else if (field === 'description') values.push(stripHtml(raw));
        else if (field === 'colour') values.push(toUpperName(raw));
        else if (field === 'section' || field === 'article_group') values.push(toTitleCase(raw));
        else if (field === 'article_code') values.push(raw.trim().toUpperCase());
        else values.push(raw);
      } else {
        values.push(raw);
      }
    }
  }

  if (fields.length === 0) {
    return oldProduct;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_PRODUCT',
    entityType: 'product',
    entityId: id,
    oldValues: oldProduct as unknown as Record<string, unknown>,
    newValues: input as Record<string, unknown>,
  });

  return result.rows[0];
}

export async function deleteProduct(id: string, deletedBy: string): Promise<void> {
  const existing = await query('SELECT id, article_name FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }

  await query('UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

  await createAuditLog({
    userId: deletedBy,
    action: 'DELETE_PRODUCT',
    entityType: 'product',
    entityId: id,
  });

  logger.info(`Product deactivated: ${existing.rows[0].article_name}`);
}

export async function getSiblingProducts(productId: string): Promise<Product[]> {
  const productResult = await query('SELECT article_name, colour FROM products WHERE id = $1 AND is_active = true', [productId]);
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  const { article_name, colour } = productResult.rows[0];

  // Case-insensitive match on article_name (belt-and-braces: article_name is
  // now stored UPPERCASE, but this guards against any stray casing so sizes
  // aggregate across the same article; front-end dedupes by size).
  const result = await query(
    `SELECT * FROM products WHERE UPPER(article_name) = UPPER($1) AND UPPER(colour) = UPPER($2) AND is_active = true ORDER BY size`,
    [article_name, colour]
  );
  return result.rows;
}

export async function getColoursByProduct(productId: string): Promise<{ colour: string; product_id: string }[]> {
  const productResult = await query('SELECT article_name FROM products WHERE id = $1 AND is_active = true', [productId]);
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  const { article_name } = productResult.rows[0];

  // Match article_name case-insensitively AND dedupe colours case-insensitively
  // (colour is now stored UPPERCASE per the 2026-07-16 fix, but DISTINCT ON
  // UPPER(colour) guards against stray casing so "BLUE"/"Blue" collapse to one
  // dropdown entry instead of repeating). See child-boxes/generate.
  const result = await query(
    `SELECT DISTINCT ON (UPPER(colour)) UPPER(colour) AS colour, id as product_id
     FROM products
     WHERE UPPER(article_name) = UPPER($1) AND is_active = true
     ORDER BY UPPER(colour)`,
    [article_name]
  );
  return result.rows;
}

export async function updateProductImage(
  productId: string,
  imageUrl: string,
  updatedBy: string
): Promise<void> {
  const productResult = await query('SELECT article_code, colour FROM products WHERE id = $1', [productId]);
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  const { article_code, colour } = productResult.rows[0];

  await query(
    'UPDATE products SET image_url = $1, updated_at = NOW() WHERE article_code = $2 AND colour = $3',
    [imageUrl, article_code, colour]
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_PRODUCT_IMAGE',
    entityType: 'product',
    entityId: productId,
    newValues: { image_url: imageUrl, article_code, colour },
  });

  logger.info(`Product image updated for article ${article_code} / ${colour}`);
}

export async function bulkCreateProductsBySizeRange(
  input: BulkCreateBySizeRangeInput,
  createdBy: string
): Promise<Product[]> {
  const articleName = toUpperName(stripHtml(input.article_name) ?? input.article_name);
  const description = input.description ? stripHtml(input.description) : input.description;
  const colour = toUpperName(input.colour);
  const section = toTitleCase(input.section);
  const articleCode = input.article_code.trim().toUpperCase();
  const articleGroup = input.article_group ? toTitleCase(input.article_group) : input.article_group;

  const from = parseInt(input.size_from);
  const to = parseInt(input.size_to);

  const normSection = section.toUpperCase().replace(/\s+/g, '-');
  const normArticle = articleName.toUpperCase().replace(/\s+/g, '-');
  const normCategory = input.category.trim().toUpperCase().replace(/\s+/g, '-');
  const normColour = colour.toUpperCase().replace(/\s+/g, '-');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const products: Product[] = [];

    for (let size = from; size <= to; size++) {
      // Use same client for COUNT so each insert within this txn is visible to the next serial calculation
      const countResult = await client.query(
        `SELECT COUNT(*) FROM products
         WHERE UPPER(REPLACE(section, ' ', '-')) = $1
           AND UPPER(REPLACE(article_name, ' ', '-')) = $2
           AND UPPER(REPLACE(category, ' ', '-')) = $3
           AND UPPER(REPLACE(colour, ' ', '-')) = $4`,
        [normSection, normArticle, normCategory, normColour]
      );
      const serial = parseInt(countResult.rows[0].count, 10) + 1;
      const serialStr = String(serial).padStart(2, '0');
      const sku = `${normSection}-${normArticle}-${normCategory}-${serialStr}-${normColour}`;

      const result = await client.query(
        `INSERT INTO products (article_name, sku, article_code, colour, size, mrp, description, category, section, location, article_group, hsn_code, size_from, size_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          articleName, sku, articleCode, colour, String(size), input.mrp,
          description || null, input.category, section, input.location || null,
          articleGroup || null, input.hsn_code || null, input.size_from, input.size_to,
        ]
      );

      const product: Product = result.rows[0];
      products.push(product);

      await createAuditLog({
        userId: createdBy,
        action: 'CREATE_PRODUCT',
        entityType: 'product',
        entityId: product.id,
        newValues: { ...input, sku, size: String(size) } as Record<string, unknown>,
      });
    }

    await client.query('COMMIT');
    logger.info(`Bulk size-range product creation: ${products.length} products created for ${articleName} / ${input.colour} (sizes ${from}-${to})`);
    return products;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const VALID_CATEGORIES = ['Gents', 'Ladies', 'Boys', 'Girls'];
const VALID_LOCATIONS = ['VKIA', 'MIA', 'F540'];

interface BulkRowResult {
  row: number;
  status: 'success' | 'error';
  sku?: string;
  article_name?: string;
  error?: string;
}

export async function bulkCreateProducts(
  csvBuffer: Buffer,
  createdBy: string
): Promise<{ created: number; errors: BulkRowResult[] }> {
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
    throw new ConflictError('CSV file is empty. Please add product rows below the header.');
  }

  // Env-driven cap: default 500 (test/local); live sets PRODUCT_CSV_MAX_ROWS=2000.
  const maxRows = Number(process.env.PRODUCT_CSV_MAX_ROWS) || 500;
  if (records.length > maxRows) {
    throw new ConflictError(`CSV contains ${records.length} rows. Maximum allowed is ${maxRows} per upload.`);
  }

  const requiredCols = ['article_code', 'article_name', 'colour', 'size', 'mrp', 'section', 'category'];
  const headerKeys = Object.keys(records[0]).map((h) => h.toLowerCase().trim());
  const missingCols = requiredCols.filter((c) => !headerKeys.includes(c));
  if (missingCols.length > 0) {
    throw new ConflictError(`Missing required columns: ${missingCols.join(', ')}. Download the sample file for reference.`);
  }

  const errors: BulkRowResult[] = [];

  // ── Pass 1: validate + clean every row in memory (no DB round-trips) ───────
  interface ValidRow {
    rowNum: number;
    cleanName: string; cleanColour: string; cleanSection: string;
    cleanArticleCode: string; cleanArticleGroup: string | null; cleanDesc: string | null;
    category: string; location: string | null;
    size: string; mrp: number; hsn: string | null; sizeFrom: string | null; sizeTo: string | null;
    normSection: string; normArticle: string; normCategory: string; normColour: string;
    sku: string;
  }
  const valid: ValidRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const rowNum = i + 2; // +2 because row 1 is header, data starts at 2

    const row: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      row[key.toLowerCase().trim()] = val;
    }

    const rowErrors: string[] = [];
    if (!row.article_code?.trim()) rowErrors.push('article_code is empty');
    if (!row.article_name?.trim()) rowErrors.push('article_name is empty');
    if (!row.colour?.trim()) rowErrors.push('colour is empty');
    if (!row.size?.trim()) rowErrors.push('size is empty');
    if (!row.section?.trim()) rowErrors.push('section is empty');
    if (!row.category?.trim()) rowErrors.push('category is empty');

    const mrp = parseFloat(row.mrp);
    if (!row.mrp?.trim() || isNaN(mrp) || mrp <= 0) {
      rowErrors.push('mrp must be a positive number');
    }

    if (row.article_code && row.article_code.trim().length > 20) {
      rowErrors.push('article_code exceeds 20 characters');
    }

    // Category & location are matched case-insensitively and stored in canonical casing,
    // so "ladies", "LADIES", "Ladies" all resolve to "Ladies" (and "vkia" -> "VKIA").
    const canonicalCat = row.category?.trim() ? canonicalCategory(row.category) : undefined;
    if (row.category?.trim() && !canonicalCat) {
      rowErrors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    const canonicalLoc = row.location?.trim() ? canonicalLocation(row.location) : undefined;
    if (row.location?.trim() && !canonicalLoc) {
      rowErrors.push(`location must be one of: ${VALID_LOCATIONS.join(', ')}`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, status: 'error', article_name: row.article_name, error: rowErrors.join('; ') });
      continue;
    }

    // Name fields stored in uniform Title Case; codes uppercased.
    const cleanName = toUpperName(stripHtml(row.article_name.trim()) ?? row.article_name.trim());
    const cleanColour = toUpperName(row.colour.trim());
    const cleanSection = toTitleCase(row.section.trim());
    valid.push({
      rowNum,
      cleanName, cleanColour, cleanSection,
      cleanArticleCode: row.article_code.trim().toUpperCase(),
      cleanArticleGroup: row.article_group?.trim() ? (toTitleCase(row.article_group.trim()) ?? null) : null,
      cleanDesc: row.description?.trim() ? (stripHtml(row.description.trim()) ?? null) : null,
      category: canonicalCat!, location: canonicalLoc ?? null,
      size: row.size.trim(), mrp,
      hsn: row.hsn_code?.trim() || null,
      sizeFrom: row.size_from?.trim() || null,
      sizeTo: row.size_to?.trim() || null,
      normSection: cleanSection.toUpperCase().replace(/\s+/g, '-'),
      normArticle: cleanName.toUpperCase().replace(/\s+/g, '-'),
      normCategory: canonicalCat!.toUpperCase().replace(/\s+/g, '-'),
      normColour: cleanColour.toUpperCase().replace(/\s+/g, '-'),
      sku: '',
    });
  }

  if (valid.length === 0) {
    logger.info(`Bulk product upload: 0 created, ${errors.length} errors`);
    return { created: 0, errors };
  }

  // ── Pass 2: assign SKU serials per combo from ONE grouped count query ──────
  // Mirrors generateSku: SKU = SECTION-ARTICLE-CATEGORY-serial-COLOUR.
  // Next serial per combo = MAX existing serial + running index (NOT COUNT):
  // serials go non-contiguous once any product in the combo is deleted, so
  // COUNT+1 can collide with a live SKU (the duplicate-SKU bulk-import error).
  // Parse the serial by stripping the known prefix/suffix (safe despite hyphens).
  const skusResult = await query(
    `SELECT UPPER(REPLACE(section, ' ', '-')) AS s,
            UPPER(REPLACE(article_name, ' ', '-')) AS a,
            UPPER(REPLACE(category, ' ', '-')) AS c,
            UPPER(REPLACE(colour, ' ', '-')) AS col,
            UPPER(size) AS sz,
            sku
     FROM products`
  );
  const comboMaxSerial = new Map<string, number>();
  // Identity of an existing product variant = section|article|category|colour|size
  // (case-insensitive). Used below to REJECT rows that duplicate a product that
  // already exists, instead of minting a new SKU for the same variant.
  const existingVariants = new Set<string>();
  for (const r of skusResult.rows) {
    const key = `${r.s}|${r.a}|${r.c}|${r.col}`;
    existingVariants.add(`${key}|${r.sz}`);
    const prefix = `${r.s}-${r.a}-${r.c}-`;
    const suffix = `-${r.col}`;
    const sku = r.sku as string;
    if (sku.startsWith(prefix) && sku.endsWith(suffix)) {
      const n = parseInt(sku.slice(prefix.length, sku.length - suffix.length), 10);
      if (!isNaN(n) && n > (comboMaxSerial.get(key) ?? 0)) comboMaxSerial.set(key, n);
    }
  }

  // ── Pass 1.5: reject duplicate variants (already in DB or earlier in file) ──
  // A create-upload must NOT silently add a second row for an existing product;
  // that is exactly how the catalog accumulated duplicate rows. Genuinely new
  // sizes still pass (their variant identity isn't in the set).
  const seenVariants = new Set<string>();
  const freshRows: ValidRow[] = [];
  for (const v of valid) {
    const vkey = `${v.normSection}|${v.normArticle}|${v.normCategory}|${v.normColour}|${v.size.toUpperCase()}`;
    if (existingVariants.has(vkey)) {
      errors.push({ row: v.rowNum, status: 'error', article_name: v.cleanName, error: `Product already exists: ${v.cleanName} / ${v.cleanColour} / size ${v.size}` });
      continue;
    }
    if (seenVariants.has(vkey)) {
      errors.push({ row: v.rowNum, status: 'error', article_name: v.cleanName, error: `Duplicate row in file: ${v.cleanName} / ${v.cleanColour} / size ${v.size}` });
      continue;
    }
    seenVariants.add(vkey);
    freshRows.push(v);
  }

  const running = new Map<string, number>();
  for (const v of freshRows) {
    const key = `${v.normSection}|${v.normArticle}|${v.normCategory}|${v.normColour}`;
    const base = running.get(key) ?? (comboMaxSerial.get(key) ?? 0);
    const serial = base + 1;
    running.set(key, serial);
    v.sku = `${v.normSection}-${v.normArticle}-${v.normCategory}-${String(serial).padStart(2, '0')}-${v.normColour}`;
  }

  // ── Pass 3: dedup candidate SKUs against the DB (one query) + intra-batch ──
  const existingResult = await query(
    'SELECT sku FROM products WHERE sku = ANY($1::text[])',
    [freshRows.map((v) => v.sku)]
  );
  const takenSkus = new Set<string>(existingResult.rows.map((r) => r.sku));

  const toInsert: ValidRow[] = [];
  const seenInBatch = new Set<string>();
  for (const v of freshRows) {
    if (takenSkus.has(v.sku) || seenInBatch.has(v.sku)) {
      errors.push({ row: v.rowNum, status: 'error', sku: v.sku, article_name: v.cleanName, error: `Duplicate SKU: ${v.sku} already exists` });
      continue;
    }
    seenInBatch.add(v.sku);
    toInsert.push(v);
  }

  // ── Pass 4: chunked multi-row INSERT (per chunk txn; degrade to per-row on failure) ──
  const insertCols = `(article_name, sku, article_code, colour, size, mrp, description, category, section, location, article_group, hsn_code, size_from, size_to)`;
  const rowParams = (v: ValidRow): unknown[] => [
    v.cleanName, v.sku, v.cleanArticleCode, v.cleanColour, v.size, v.mrp, v.cleanDesc,
    v.category, v.cleanSection, v.location, v.cleanArticleGroup, v.hsn, v.sizeFrom, v.sizeTo,
  ];
  let created = 0;
  const CHUNK = 500; // 500 × 14 cols = 7000 bind params, well under PG's 65535
  for (let start = 0; start < toInsert.length; start += CHUNK) {
    const chunk = toInsert.slice(start, start + CHUNK);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      chunk.forEach((v, idx) => {
        const b = idx * 14;
        valuesSql.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14})`);
        params.push(...rowParams(v));
      });
      await client.query(`INSERT INTO products ${insertCols} VALUES ${valuesSql.join(', ')}`, params);
      await client.query('COMMIT');
      created += chunk.length;
    } catch {
      await client.query('ROLLBACK');
      // Degrade to per-row so one unexpected bad row doesn't sink the whole chunk
      for (const v of chunk) {
        try {
          await query(`INSERT INTO products ${insertCols} VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, rowParams(v));
          created++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          errors.push({ row: v.rowNum, status: 'error', sku: v.sku, article_name: v.cleanName, error: message });
        }
      }
    } finally {
      client.release();
    }
  }

  // ── Pass 5: one summary audit log (vs a row per product) ───────────────────
  await createAuditLog({
    userId: createdBy,
    action: 'BULK_UPLOAD_PRODUCTS',
    entityType: 'product',
    newValues: { created, errors: errors.length, source: 'csv_bulk_upload' },
  });

  errors.sort((a, b) => a.row - b.row); // stable, readable per-row report
  logger.info(`Bulk product upload: ${created} created, ${errors.length} errors`);
  return { created, errors };
}

/** Escape a single CSV cell: quote it (doubling any internal quotes) if it contains a comma, quote, or newline. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/["\n,]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportProductsCsv(): Promise<string> {
  const columns = [
    'sku', 'article_code', 'article_name', 'colour', 'size', 'section', 'category',
    'mrp', 'hsn_code', 'location', 'article_group', 'description', 'is_active',
  ];

  const result = await query(
    `SELECT sku, article_code, article_name, colour, size, section, category, mrp, hsn_code, location, article_group, description, is_active
     FROM products
     ORDER BY article_name, colour, size`
  );

  const lines = [columns.join(',')];
  for (const row of result.rows) {
    const cells = columns.map((col) => {
      if (col === 'is_active') return row[col] ? 'true' : 'false';
      return csvCell(row[col]);
    });
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}

export async function bulkUpdateProducts(
  csvBuffer: Buffer,
  updatedBy: string
): Promise<{ updated: number; errors: BulkRowResult[] }> {
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
    throw new ConflictError('CSV file is empty. Please add product rows below the header.');
  }

  // Env-driven cap: default 500 (test/local); live sets PRODUCT_CSV_MAX_ROWS=2000.
  const maxRows = Number(process.env.PRODUCT_CSV_MAX_ROWS) || 500;
  if (records.length > maxRows) {
    throw new ConflictError(`CSV contains ${records.length} rows. Maximum allowed is ${maxRows} per upload.`);
  }

  const headerKeys = Object.keys(records[0]).map((h) => h.toLowerCase().trim());
  if (!headerKeys.includes('sku')) {
    throw new ConflictError('Missing required column: sku. Download the current products file for reference.');
  }

  const errors: BulkRowResult[] = [];

  interface ValidUpdateRow {
    rowNum: number;
    sku: string;
    updates: Record<string, unknown>;
  }
  const valid: ValidUpdateRow[] = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const rowNum = i + 2; // +2 because row 1 is header, data starts at 2

    const row: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      row[key.toLowerCase().trim()] = val;
    }

    // Skip fully-blank rows silently (not counted as errors)
    const allBlank = Object.values(row).every((v) => !v || !v.trim());
    if (allBlank) continue;

    if (!row.sku?.trim()) {
      errors.push({ row: rowNum, status: 'error', error: 'sku is empty' });
      continue;
    }
    const sku = row.sku.trim().toUpperCase();

    if (seenSkus.has(sku)) {
      errors.push({ row: rowNum, status: 'error', sku, error: 'duplicate SKU in file' });
      continue;
    }

    const rowErrors: string[] = [];
    const updates: Record<string, unknown> = {};

    if (row.mrp?.trim()) {
      const mrp = parseFloat(row.mrp);
      if (isNaN(mrp) || mrp <= 0) {
        rowErrors.push('mrp must be a positive number');
      } else {
        updates.mrp = mrp;
      }
    }

    if (row.description?.trim()) {
      updates.description = stripHtml(row.description.trim());
    }

    if (row.hsn_code?.trim()) {
      updates.hsn_code = row.hsn_code.trim();
    }

    if (row.location?.trim()) {
      const canonicalLoc = canonicalLocation(row.location);
      if (!canonicalLoc) {
        rowErrors.push(`location must be one of: ${VALID_LOCATIONS.join(', ')}`);
      } else {
        updates.location = canonicalLoc;
      }
    }

    if (row.article_group?.trim()) {
      updates.article_group = toTitleCase(row.article_group.trim());
    }

    if (row.is_active?.trim()) {
      const v = row.is_active.trim().toLowerCase();
      if (['true', '1', 'yes', 'active'].includes(v)) {
        updates.is_active = true;
      } else if (['false', '0', 'no', 'inactive'].includes(v)) {
        updates.is_active = false;
      } else {
        rowErrors.push('is_active must be true/false');
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, status: 'error', sku, error: rowErrors.join('; ') });
      continue;
    }

    if (Object.keys(updates).length === 0) {
      errors.push({ row: rowNum, status: 'error', sku, error: 'no updatable fields provided (only identity columns present)' });
      continue;
    }

    seenSkus.add(sku);
    valid.push({ rowNum, sku, updates });
  }

  if (valid.length === 0) {
    logger.info(`Bulk product update: 0 updated, ${errors.length} errors`);
    return { updated: 0, errors };
  }

  const skus = valid.map((v) => v.sku);
  const existingResult = await query('SELECT * FROM products WHERE UPPER(sku) = ANY($1)', [skus]);
  const productMap = new Map<string, Record<string, unknown>>();
  for (const r of existingResult.rows) {
    productMap.set(String(r.sku).toUpperCase(), r);
  }

  let updated = 0;
  for (const v of valid) {
    const existing = productMap.get(v.sku);
    if (!existing) {
      errors.push({ row: v.rowNum, status: 'error', sku: v.sku, error: 'SKU not found' });
      continue;
    }

    try {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;
      for (const [col, val] of Object.entries(v.updates)) {
        fields.push(`${col} = $${paramIndex++}`);
        values.push(val);
      }
      fields.push('updated_at = NOW()');
      values.push(existing.id);

      await query(`UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);

      await createAuditLog({
        userId: updatedBy,
        action: 'UPDATE_PRODUCT',
        entityType: 'product',
        entityId: existing.id as string,
        oldValues: existing,
        newValues: v.updates,
      });

      updated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: v.rowNum, status: 'error', sku: v.sku, error: message });
    }
  }

  errors.sort((a, b) => a.row - b.row);
  logger.info(`Bulk product update: ${updated} updated, ${errors.length} errors`);
  return { updated, errors };
}
