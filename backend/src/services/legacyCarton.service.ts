import { v4 as uuidv4 } from 'uuid';
import { parse } from 'csv-parse/sync';
import { query, getClient } from '../config/database';
import { ConflictError } from '../utils/errors';
import { generateUniqueBarcode } from '../utils/barcodeGenerator';
import { createAuditLog } from './auditLog.service';
import { logger } from '../utils/logger';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface LegacyRowResult {
  row: number;
  status: 'error';
  section?: string;
  category?: string;
  article_group?: string;
  error: string;
}

export interface LegacyUploadResult {
  cartons_created: number;
  rows_processed: number;
  rows_skipped_zero: number;
  warnings: string[];
  errors: LegacyRowResult[];
}

// ─── Canonical category list (mirrors product.service.ts) ────────────────────

const VALID_CATEGORIES = ['Gents', 'Ladies', 'Boys', 'Girls'];

// ─── Parser: extract article_group + size_group from raw CSV string ───────────

/**
 * Extracts the last balanced `(...)` group as size_group (trimmed),
 * everything else (plus any trailing chars after the closing paren) = article_group.
 *
 * Examples:
 *   "ALIA PLUS (4-8)"          → { article_group: "ALIA PLUS",      size_group: "4-8" }
 *   "BUSKER 01-20 (6-10)"      → { article_group: "BUSKER 01-20",   size_group: "6-10" }
 *   "MOGLI (6-8)K"             → { article_group: "MOGLIK",         size_group: "6-8" }
 *   "ROMEX - N (4 -5)"         → { article_group: "ROMEX - N",      size_group: "4 -5" }
 *   "MOGLI PLUS 01-10(2-5)"    → { article_group: "MOGLI PLUS 01-10", size_group: "2-5" }
 *   "PLAIN SLIPPER"            → { article_group: "PLAIN SLIPPER",  size_group: null }
 */
export function parseArticleGroup(raw: string): { article_group: string; size_group: string | null } {
  const trimmed = raw.trim();

  // Find the last `(...)` pair
  const lastClose = trimmed.lastIndexOf(')');
  if (lastClose === -1) {
    return { article_group: trimmed, size_group: null };
  }

  // Walk backwards from lastClose to find its matching open paren
  let depth = 0;
  let openIdx = -1;
  for (let i = lastClose; i >= 0; i--) {
    if (trimmed[i] === ')') depth++;
    else if (trimmed[i] === '(') {
      depth--;
      if (depth === 0) {
        openIdx = i;
        break;
      }
    }
  }

  if (openIdx === -1) {
    // Unbalanced — treat whole string as article_group
    return { article_group: trimmed, size_group: null };
  }

  const size_group = trimmed.slice(openIdx + 1, lastClose).trim();
  // Everything before the open paren, trailing separators stripped
  const beforeParen = trimmed.slice(0, openIdx).replace(/[-\s]+$/, '');
  // Everything after the close paren (e.g. "K" in "MOGLI (6-8)K")
  const afterParen = trimmed.slice(lastClose + 1);
  const article_group = (beforeParen + afterParen).trim();

  return { article_group, size_group: size_group || null };
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Case-insensitive lookup against product_sections table.
 * Returns canonical name if found, otherwise the verbatim raw value.
 */
async function normalizeSection(raw: string): Promise<{ canonical: string; matched: boolean }> {
  const result = await query(
    'SELECT name FROM product_sections WHERE LOWER(name) = LOWER($1)',
    [raw.trim()]
  );
  if (result.rows.length > 0) {
    return { canonical: result.rows[0].name as string, matched: true };
  }
  return { canonical: raw.trim(), matched: false };
}

/**
 * Case-insensitive match against the canonical category list.
 * Returns canonical form if matched, otherwise verbatim raw value.
 */
function normalizeCategory(raw: string): { canonical: string; matched: boolean } {
  const trimmed = raw.trim();
  const found = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (found) {
    return { canonical: found, matched: true };
  }
  return { canonical: trimmed, matched: false };
}

// ─── Expected CSV header names (case-insensitive) ────────────────────────────

const REQUIRED_HEADERS = [
  'section',
  'category',
  'article group (size group)',
  'master carton quantity',
];

// ─── Bulk create ─────────────────────────────────────────────────────────────

export async function bulkCreateLegacyCartons(
  csvBuffer: Buffer,
  createdBy: string
): Promise<LegacyUploadResult> {
  // 1. Parse CSV
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
    throw new ConflictError('CSV file is empty. Please add data rows below the header.');
  }

  // 2. Validate headers (case-insensitive)
  const headerKeys = Object.keys(records[0]).map((h) => h.toLowerCase().trim());
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerKeys.includes(h));
  if (missingHeaders.length > 0) {
    throw new ConflictError(
      `Missing required columns: ${missingHeaders.join(', ')}. Download the sample file for reference.`
    );
  }

  // 3. Sum quantities and reject if > 20000
  let totalQty = 0;
  const normalizedRows: Array<Record<string, string>> = records.map((raw) => {
    const row: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      row[key.toLowerCase().trim()] = val;
    }
    return row;
  });

  for (const row of normalizedRows) {
    const qty = parseInt(row['master carton quantity'] ?? '', 10);
    if (!isNaN(qty) && qty > 0) totalQty += qty;
  }

  if (totalQty > 20000) {
    throw new ConflictError(
      `Total cartons across the file (${totalQty}) exceeds the upload cap of 20,000. Split into multiple files.`
    );
  }

  // 4. Duplicate-section warning: sections that already have legacy cartons
  const existingSectionsResult = await query(
    'SELECT DISTINCT section FROM master_cartons WHERE is_legacy = true'
  );
  const existingSections = new Set<string>(
    existingSectionsResult.rows.map((r: { section: string }) => (r.section ?? '').toLowerCase())
  );

  const warnings: string[] = [];
  const errors: LegacyRowResult[] = [];
  let cartons_created = 0;
  let rows_processed = 0;
  let rows_skipped_zero = 0;

  // 5. Process each row
  for (let i = 0; i < normalizedRows.length; i++) {
    const row = normalizedRows[i];
    const rowNum = i + 2; // header is row 1

    const rawSection = row['section'] ?? '';
    const rawCategory = row['category'] ?? '';
    const rawArticleGroup = row['article group (size group)'] ?? '';
    const rawQty = row['master carton quantity'] ?? '';

    // Parse quantity
    const qty = parseInt(rawQty, 10);
    if (isNaN(qty) || qty < 0) {
      errors.push({
        row: rowNum,
        status: 'error',
        section: rawSection,
        category: rawCategory,
        article_group: rawArticleGroup,
        error: `Invalid quantity "${rawQty}": must be a non-negative integer`,
      });
      continue;
    }

    if (qty === 0) {
      rows_skipped_zero++;
      continue;
    }

    rows_processed++;

    // Normalize section
    const { canonical: section, matched: sectionMatched } = await normalizeSection(rawSection);
    if (!sectionMatched) {
      warnings.push(
        `Row ${rowNum}: section "${rawSection}" did not match any known section — stored verbatim.`
      );
    } else if (existingSections.has(section.toLowerCase())) {
      warnings.push(
        `Row ${rowNum}: section "${section}" already has legacy cartons in the database — new cartons will be added (re-upload is additive).`
      );
    }

    // Normalize category
    const { canonical: category, matched: categoryMatched } = normalizeCategory(rawCategory);
    if (!categoryMatched) {
      warnings.push(
        `Row ${rowNum}: category "${rawCategory}" did not match any known category — stored verbatim.`
      );
    }

    // Parse article_group / size_group
    const { article_group, size_group } = parseArticleGroup(rawArticleGroup);

    // 6. Generate cartons inside one transaction per row
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const insertedIds: string[] = [];
      for (let j = 0; j < qty; j++) {
        const id = uuidv4();
        const cartonBarcode = await generateUniqueBarcode('MC', client);

        await client.query(
          `INSERT INTO master_cartons
             (id, carton_barcode, status, child_count, max_capacity,
              is_legacy, section, category, article_group, size_group, created_by)
           VALUES ($1, $2, 'CLOSED', 0, 50, true, $3, $4, $5, $6, $7)`,
          [id, cartonBarcode, section, category, article_group, size_group, createdBy]
        );
        insertedIds.push(id);
      }

      await client.query('COMMIT');

      // One audit log per row (outside transaction — audit failures must not rollback cartons)
      await createAuditLog({
        userId: createdBy,
        action: 'BULK_CREATE_LEGACY_CARTONS',
        entityType: 'master_carton',
        newValues: {
          section,
          category,
          article_group,
          size_group,
          quantity: qty,
          cartons_created: insertedIds.length,
        },
      });

      cartons_created += qty;
      logger.info(
        `Legacy cartons created: ${qty} for section=${section} category=${category} article_group=${article_group}`
      );
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Legacy carton creation failed for row ${rowNum}`, err);
      errors.push({
        row: rowNum,
        status: 'error',
        section,
        category,
        article_group,
        error: err instanceof Error ? err.message : 'Unknown error during carton creation',
      });
      rows_processed--;
    } finally {
      client.release();
    }
  }

  return {
    cartons_created,
    rows_processed,
    rows_skipped_zero,
    warnings,
    errors,
  };
}
