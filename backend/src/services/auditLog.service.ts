import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AuditLog } from '../types';

interface AuditLogParams {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.userId,
        params.action,
        params.entityType,
        params.entityId || null,
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        params.newValues ? JSON.stringify(params.newValues) : null,
        params.ipAddress || null,
        params.userAgent || null,
      ]
    );
  } catch (error) {
    // Audit log failures should not break the main operation
    logger.error('Failed to create audit log', error);
  }
}

export async function getAuditLogs(
  filters: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    fromDate?: string;
    toDate?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: AuditLog[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    values.push(filters.userId);
  }
  if (filters.entityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    values.push(filters.entityType);
  }
  if (filters.entityId) {
    conditions.push(`entity_id = $${paramIndex++}`);
    values.push(filters.entityId);
  }
  if (filters.action) {
    conditions.push(`action = $${paramIndex++}`);
    values.push(filters.action);
  }
  if (filters.fromDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    values.push(filters.toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT * FROM audit_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}
