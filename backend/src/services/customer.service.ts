import { query } from '../config/database';
import { Customer } from '../types';
import { NotFoundError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateCustomerInput, UpdateCustomerInput } from '../models/schemas/customer.schema';
import { logger } from '../utils/logger';

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
  const result = await query(
    `INSERT INTO customers (firm_name, address, delivery_location, gstin, private_marka, gr, contact_person_name, contact_person_mobile)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.firm_name,
      input.address || null,
      input.delivery_location || null,
      input.gstin || null,
      input.private_marka || null,
      input.gr || null,
      input.contact_person_name || null,
      input.contact_person_mobile || null,
    ]
  );

  const customer: Customer = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_CUSTOMER',
    entityType: 'customer',
    entityId: customer.id,
    newValues: { firm_name: input.firm_name, gstin: input.gstin } as Record<string, unknown>,
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
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: Customer[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    values.push(filters.is_active);
  }
  if (filters.search) {
    conditions.push(`(firm_name ILIKE $${paramIndex} OR contact_person_name ILIKE $${paramIndex} OR gstin ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM customers ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT * FROM customers ${whereClause}
     ORDER BY firm_name ASC
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
