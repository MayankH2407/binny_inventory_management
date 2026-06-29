import { parse } from 'csv-parse/sync';
import { query } from '../config/database';
import { Customer } from '../types';
import { NotFoundError, ConflictError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateCustomerInput, UpdateCustomerInput } from '../models/schemas/customer.schema';
import { logger } from '../utils/logger';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const MOBILE_MIN_DIGITS = 10;
const MOBILE_MAX_LEN = 255;
const CUSTOMER_TYPES = ['Primary Dealer', 'Sub Dealer'];

/**
 * Normalize a CSV header cell to the canonical snake_case column name.
 * Clients export with spaces and occasional typos ("FIRM NAME", "COUSTMER TYPE",
 * "PRIVATE MARK"), so we lower-case, collapse spaces/dots/dashes to underscores,
 * then resolve known aliases.
 */
const HEADER_ALIASES: Record<string, string> = {
  coustmer_type: 'customer_type',
  costumer_type: 'customer_type',
  customer_typ: 'customer_type',
  private_mark: 'private_marka',
  primary_dealer: 'primary_dealer_name',
};
function normalizeHeader(header: string): string {
  const base = header
    .toLowerCase()
    .trim()
    .replace(/[\s.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return HEADER_ALIASES[base] ?? base;
}

/** Resolve a customer_type to its canonical casing (case-insensitive); undefined if invalid. */
function canonicalCustomerType(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  return CUSTOMER_TYPES.find((t) => t.toLowerCase() === v);
}

export async function checkDuplicateFirmName(firmName: string): Promise<boolean> {
  const result = await query(
    'SELECT id FROM customers WHERE LOWER(firm_name) = LOWER($1) AND is_active = true',
    [firmName]
  );
  return result.rows.length > 0;
}

export async function createCustomer(
  input: CreateCustomerInput,
  createdBy: string
): Promise<Customer> {
  const customerType = input.customer_type ?? 'Primary Dealer';
  let primaryDealerId = input.primary_dealer_id ?? null;

  let address = input.address ?? null;
  let deliveryLocation = input.delivery_location ?? null;
  let gstin = input.gstin ?? null;
  let contactPersonName = input.contact_person_name ?? null;
  let contactPersonMobile = input.contact_person_mobile ?? null;

  if (customerType === 'Sub Dealer' && primaryDealerId) {
    const primaryResult = await query(
      "SELECT * FROM customers WHERE id = $1 AND customer_type = 'Primary Dealer' AND is_active = true",
      [primaryDealerId]
    );
    if (primaryResult.rows.length === 0) {
      throw new NotFoundError('Primary dealer not found');
    }
    const primary = primaryResult.rows[0];
    if (address == null) address = primary.address;
    if (deliveryLocation == null) deliveryLocation = primary.delivery_location;
    if (gstin == null) gstin = primary.gstin;
    if (contactPersonName == null) contactPersonName = primary.contact_person_name;
    if (contactPersonMobile == null) contactPersonMobile = primary.contact_person_mobile;
  }

  const result = await query(
    `INSERT INTO customers (firm_name, address, delivery_location, gstin, private_marka, gr, contact_person_name, contact_person_mobile, customer_type, primary_dealer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.firm_name,
      address,
      deliveryLocation,
      gstin,
      input.private_marka || null,
      input.gr || null,
      contactPersonName,
      contactPersonMobile,
      customerType,
      primaryDealerId,
    ]
  );

  const customer: Customer = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_CUSTOMER',
    entityType: 'customer',
    entityId: customer.id,
    newValues: { firm_name: input.firm_name, gstin: input.gstin, customer_type: customerType } as Record<string, unknown>,
  });

  logger.info(`Customer created: ${input.firm_name}`);
  return customer;
}

export async function getCustomerById(id: string): Promise<Customer> {
  const result = await query('SELECT * FROM customers WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }
  return result.rows[0];
}

export async function getCustomers(
  filters: {
    search?: string;
    is_active?: boolean;
    customer_type?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: Customer[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.is_active !== undefined) {
    conditions.push(`c.is_active = $${paramIndex++}`);
    values.push(filters.is_active);
  }
  if (filters.customer_type) {
    conditions.push(`c.customer_type = $${paramIndex++}`);
    values.push(filters.customer_type);
  }
  if (filters.search) {
    conditions.push(`(c.firm_name ILIKE $${paramIndex} OR c.contact_person_name ILIKE $${paramIndex} OR c.gstin ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM customers c ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT c.*, pd.firm_name as primary_dealer_name
     FROM customers c
     LEFT JOIN customers pd ON pd.id = c.primary_dealer_id
     ${whereClause}
     ORDER BY c.firm_name ASC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  updatedBy: string
): Promise<Customer> {
  const existing = await query('SELECT * FROM customers WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }

  const oldCustomer: Customer = existing.rows[0];

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const updateableFields: (keyof UpdateCustomerInput)[] = [
    'firm_name', 'address', 'delivery_location', 'gstin', 'private_marka',
    'gr', 'contact_person_name', 'contact_person_mobile', 'is_active',
    'customer_type', 'primary_dealer_id',
  ];

  for (const field of updateableFields) {
    if (input[field] !== undefined) {
      fields.push(`${field} = $${paramIndex++}`);
      values.push(input[field]);
    }
  }

  if (fields.length === 0) {
    return oldCustomer;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE customers SET ${fields.join(', ')} WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_CUSTOMER',
    entityType: 'customer',
    entityId: id,
    oldValues: { firm_name: oldCustomer.firm_name } as Record<string, unknown>,
    newValues: input as Record<string, unknown>,
  });

  return result.rows[0];
}

export async function deleteCustomer(id: string, deletedBy: string): Promise<void> {
  const existing = await query('SELECT id, firm_name FROM customers WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }

  await query('UPDATE customers SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

  await createAuditLog({
    userId: deletedBy,
    action: 'DELETE_CUSTOMER',
    entityType: 'customer',
    entityId: id,
  });

  logger.info(`Customer deactivated: ${existing.rows[0].firm_name}`);
}

export async function getPrimaryDealers(): Promise<Customer[]> {
  const result = await query(
    "SELECT * FROM customers WHERE customer_type = 'Primary Dealer' AND is_active = true ORDER BY firm_name"
  );
  return result.rows;
}

export async function getSubDealers(primaryDealerId: string): Promise<Customer[]> {
  const result = await query(
    'SELECT * FROM customers WHERE primary_dealer_id = $1 AND is_active = true ORDER BY firm_name',
    [primaryDealerId]
  );
  return result.rows;
}

interface BulkCustomerRowResult {
  row: number;
  status: 'success' | 'error';
  firm_name?: string;
  error?: string;
}

/**
 * Bulk-create customers from a CSV buffer. Columns:
 *   firm_name (required), address, delivery_location, gstin, private_marka, gr,
 *   contact_person_name, contact_person_mobile, customer_type, primary_dealer_name
 * Sub Dealers must name an EXISTING active Primary Dealer via primary_dealer_name.
 * Reuses createCustomer per valid row (preserves sub-dealer inheritance + audit);
 * customer volumes are low, so a per-row loop is fine.
 */
export async function bulkCreateCustomers(
  csvBuffer: Buffer,
  createdBy: string
): Promise<{ created: number; errors: BulkCustomerRowResult[] }> {
  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch {
    throw new ConflictError('Invalid CSV format. Please ensure the file is a valid CSV with headers.');
  }

  if (records.length === 0) {
    throw new ConflictError('CSV file is empty. Please add customer rows below the header.');
  }

  // Validate headers off the raw first row (spreadsheet exports normalize the same across rows).
  const headerKeys = Object.keys(records[0]).map(normalizeHeader);
  if (!headerKeys.includes('firm_name')) {
    throw new ConflictError('Missing required column: firm_name. Download the sample file for reference.');
  }

  // Drop fully-blank rows (spreadsheet exports pad with trailing empty rows like ",,,,"),
  // keeping each surviving row's original file line number for accurate error reporting.
  const dataRows = records
    .map((raw, idx) => ({ raw, rowNum: idx + 2 })) // +2: row 1 is header, data starts at 2
    .filter(({ raw }) => Object.values(raw).some((v) => String(v ?? '').trim() !== ''));
  if (dataRows.length === 0) {
    throw new ConflictError('CSV file has no data rows. Please add customer rows below the header.');
  }
  if (dataRows.length > 500) {
    throw new ConflictError(`CSV contains ${dataRows.length} rows. Maximum allowed is 500 per upload.`);
  }

  // Prefetch existing active firm names + active Primary Dealers (by lower-cased firm name).
  const existingFirms = await query('SELECT LOWER(firm_name) AS f FROM customers WHERE is_active = true');
  const takenFirms = new Set<string>(existingFirms.rows.map((r) => r.f));
  const primaryRows = await query(
    "SELECT id, LOWER(firm_name) AS f FROM customers WHERE customer_type = 'Primary Dealer' AND is_active = true"
  );
  const primaryByName = new Map<string, string>();
  for (const r of primaryRows.rows) primaryByName.set(r.f, r.id);

  const errors: BulkCustomerRowResult[] = [];
  const seenInBatch = new Set<string>();
  let created = 0;

  for (const { raw, rowNum } of dataRows) {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) row[normalizeHeader(k)] = v;

    const rowErrors: string[] = [];
    const firmName = row.firm_name?.trim();
    if (!firmName) rowErrors.push('firm_name is empty');

    if (row.gstin?.trim() && !GSTIN_REGEX.test(row.gstin.trim())) {
      rowErrors.push('invalid GSTIN format (expected e.g. 22AAAAA0000A1Z5)');
    }

    // Mobile is free-text contact info (may hold multiple numbers). Collapse
    // whitespace, keep the whole string, and only require >=10 digits total.
    let contactMobile: string | null = row.contact_person_mobile?.trim().replace(/\s+/g, ' ') || null;
    if (contactMobile) {
      if (contactMobile.length > MOBILE_MAX_LEN) contactMobile = contactMobile.slice(0, MOBILE_MAX_LEN);
      if ((contactMobile.match(/\d/g) || []).length < MOBILE_MIN_DIGITS) {
        rowErrors.push('contact_person_mobile must contain at least 10 digits');
      }
    }

    let customerType = 'Primary Dealer';
    if (row.customer_type?.trim()) {
      const ct = canonicalCustomerType(row.customer_type);
      if (!ct) rowErrors.push("customer_type must be 'Primary Dealer' or 'Sub Dealer'");
      else customerType = ct;
    }

    let primaryDealerId: string | null = null;
    if (customerType === 'Sub Dealer') {
      const pdName = row.primary_dealer_name?.trim();
      if (!pdName) {
        rowErrors.push('primary_dealer_name is required for a Sub Dealer');
      } else {
        const id = primaryByName.get(pdName.toLowerCase());
        if (!id) rowErrors.push(`primary dealer "${pdName}" not found (must be an existing active Primary Dealer)`);
        else primaryDealerId = id;
      }
    }

    if (firmName) {
      const key = firmName.toLowerCase();
      if (takenFirms.has(key) || seenInBatch.has(key)) {
        rowErrors.push(`a customer named "${firmName}" already exists`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, status: 'error', firm_name: firmName, error: rowErrors.join('; ') });
      continue;
    }

    try {
      await createCustomer(
        {
          firm_name: firmName!,
          address: row.address?.trim() || null,
          delivery_location: row.delivery_location?.trim() || null,
          gstin: row.gstin?.trim() || null,
          private_marka: row.private_marka?.trim() || null,
          gr: row.gr?.trim() || null,
          contact_person_name: row.contact_person_name?.trim() || null,
          contact_person_mobile: contactMobile,
          customer_type: customerType as 'Primary Dealer' | 'Sub Dealer',
          primary_dealer_id: primaryDealerId,
        },
        createdBy
      );
      seenInBatch.add(firmName!.toLowerCase());
      created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ row: rowNum, status: 'error', firm_name: firmName, error: message });
    }
  }

  logger.info(`Bulk customer upload: ${created} created, ${errors.length} errors`);
  return { created, errors };
}
