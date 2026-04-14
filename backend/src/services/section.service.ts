import { query } from '../config/database';
import { ConflictError, NotFoundError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateSectionInput, UpdateSectionInput } from '../models/schemas/section.schema';
import { logger } from '../utils/logger';

export interface ProductSection {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export async function createSection(
  input: CreateSectionInput,
  createdBy: string
): Promise<ProductSection> {
  const existing = await query(
    'SELECT id FROM product_sections WHERE LOWER(name) = LOWER($1)',
    [input.name]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError(`Section with name "${input.name}" already exists`);
  }

  const result = await query(
    `INSERT INTO product_sections (name, display_order)
     VALUES ($1, $2)
     RETURNING *`,
    [input.name, input.display_order ?? 0]
  );

  const section: ProductSection = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_SECTION',
    entityType: 'product_section',
    entityId: section.id,
    newValues: input as Record<string, unknown>,
  });

  logger.info(`Section created: ${input.name}`);
  return section;
}

export async function getSections(includeInactive?: boolean): Promise<ProductSection[]> {
  const whereClause = includeInactive ? '' : 'WHERE is_active = true';
  const result = await query(
    `SELECT * FROM product_sections ${whereClause} ORDER BY display_order ASC, name ASC`,
    []
  );
  return result.rows;
}

export async function getSectionById(id: string): Promise<ProductSection> {
  const result = await query('SELECT * FROM product_sections WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Section not found');
  }
  return result.rows[0];
}

export async function updateSection(
  id: string,
  input: UpdateSectionInput,
  updatedBy: string
): Promise<ProductSection> {
  const existing = await query('SELECT * FROM product_sections WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Section not found');
  }

  const oldSection: ProductSection = existing.rows[0];

  if (input.name && input.name.toLowerCase() !== oldSection.name.toLowerCase()) {
    const nameCheck = await query(
      'SELECT id FROM product_sections WHERE LOWER(name) = LOWER($1) AND id != $2',
      [input.name, id]
    );
    if (nameCheck.rows.length > 0) {
      throw new ConflictError(`Section with name "${input.name}" already exists`);
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const updateableFields: (keyof UpdateSectionInput)[] = ['name', 'is_active', 'display_order'];

  for (const field of updateableFields) {
    if (input[field] !== undefined) {
      fields.push(`${field} = $${paramIndex++}`);
      values.push(input[field]);
    }
  }

  if (fields.length === 0) {
    return oldSection;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE product_sections SET ${fields.join(', ')} WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_SECTION',
    entityType: 'product_section',
    entityId: id,
    oldValues: oldSection as unknown as Record<string, unknown>,
    newValues: input as Record<string, unknown>,
  });

  return result.rows[0];
}

export async function deleteSection(id: string, deletedBy: string): Promise<void> {
  const existing = await query('SELECT id, name FROM product_sections WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Section not found');
  }

  await query(
    'UPDATE product_sections SET is_active = false, updated_at = NOW() WHERE id = $1',
    [id]
  );

  await createAuditLog({
    userId: deletedBy,
    action: 'DELETE_SECTION',
    entityType: 'product_section',
    entityId: id,
  });

  logger.info(`Section deactivated: ${existing.rows[0].name}`);
}
