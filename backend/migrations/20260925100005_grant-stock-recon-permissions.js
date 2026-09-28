/**
 * Grants the new stock_reconciliation:* permissions to the default
 * Supervisor and Warehouse Operator roles on already-deployed (TEST/LIVE)
 * systems. Admin bypasses the permission check entirely (see
 * rbac.middleware.ts) and needs no grant.
 *
 * This is the FIRST migration in this codebase that grants a new module's
 * permissions to existing roles via role_permissions (every prior module —
 * returns, samples, e-commerce — only ever touched permissions.ts, leaving
 * live roles to pick up the new keys through the Role Manager UI). Written
 * as an idempotent INSERT so it never clobbers permissions an admin has
 * since customized through that UI, and does NOT touch seeds/001_roles.ts's
 * destructive delete-and-reseed path (that stays dev/fresh-install only).
 */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO role_permissions (role_id, permission)
    SELECT r.id, p.permission
    FROM roles r
    CROSS JOIN (VALUES
      ('stock_reconciliation:read'),
      ('stock_reconciliation:count'),
      ('stock_reconciliation:approve'),
      ('stock_reconciliation:post')
    ) AS p(permission)
    WHERE r.name = 'Supervisor'
    ON CONFLICT (role_id, permission) DO NOTHING
  `);

  pgm.sql(`
    INSERT INTO role_permissions (role_id, permission)
    SELECT r.id, p.permission
    FROM roles r
    CROSS JOIN (VALUES
      ('stock_reconciliation:read'),
      ('stock_reconciliation:count')
    ) AS p(permission)
    WHERE r.name = 'Warehouse Operator'
    ON CONFLICT (role_id, permission) DO NOTHING
  `);

  // Best-effort mirror into the legacy roles.permissions jsonb column (read
  // by role.service.ts for display; auth.service.ts reads role_permissions
  // as the source of truth for non-Admin roles, so this mirror being a plain
  // append with no de-dup is harmless).
  pgm.sql(`
    UPDATE roles
    SET permissions = permissions || '["stock_reconciliation:read","stock_reconciliation:count","stock_reconciliation:approve","stock_reconciliation:post"]'::jsonb
    WHERE name = 'Supervisor'
  `);
  pgm.sql(`
    UPDATE roles
    SET permissions = permissions || '["stock_reconciliation:read","stock_reconciliation:count"]'::jsonb
    WHERE name = 'Warehouse Operator'
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM role_permissions WHERE permission LIKE 'stock_reconciliation:%'`);
};
