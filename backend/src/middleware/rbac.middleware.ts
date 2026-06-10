import { Response, NextFunction } from 'express';
import { UserRole } from '../config/constants';
import { AuthenticatedRequest } from '../types/auth.types';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { query } from '../config/database';

// ---------------------------------------------------------------------------
// Phase 1A: existing role-name-based guard — do NOT change this function.
// 44 call sites rely on it; Phase 1B migrates them.
// ---------------------------------------------------------------------------
export function authorize(...allowedRoles: UserRole[]) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }

      if (allowedRoles.length === 0) {
        next();
        return;
      }

      const result = await query('SELECT name FROM roles WHERE id = $1', [req.user.roleId]);

      if (result.rows.length === 0) {
        next(new ForbiddenError('User role not found'));
        return;
      }

      const userRole = result.rows[0].name as UserRole;

      if (!allowedRoles.includes(userRole)) {
        next(
          new ForbiddenError(
            `Access denied. Required roles: ${allowedRoles.join(', ')}. Your role: ${userRole}`
          )
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// ---------------------------------------------------------------------------
// Phase 1A: new permission-based guard — uses role_permissions table.
// ---------------------------------------------------------------------------

/**
 * Canonical stage order for master cartons.
 * Index position determines "how far along" a carton is.
 */
const MASTER_CARTON_STAGE_ORDER: string[] = ['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED'];

/**
 * Canonical stage order for child boxes.
 * SAMPLE and ECOMMERCE branch from FREE and are treated as terminal
 * (equivalent to DISPATCHED) for max_stage checks.
 */
const CHILD_BOX_STAGE_ORDER: string[] = [
  'GENERATED',
  'FREE',
  'PACKED',
  'SAMPLE',
  'ECOMMERCE',
  'DISPATCHED',
];

type StageModule = 'master_carton' | 'child_box';

interface StageCheckOptions {
  /** Extract the resource UUID from the request (e.g. (req) => req.params.id) */
  resourceIdFrom: (req: AuthenticatedRequest) => string;
  /** Which resource type to look up */
  module: StageModule;
}

interface AuthorizePermissionOptions {
  stageCheck?: StageCheckOptions;
}

/**
 * Retrieve the stage-order array for a given module.
 * SAMPLE and ECOMMERCE are mapped to the DISPATCHED position so that
 * max_stage='PACKED' blocks those terminal branches.
 */
function stageIndex(stage: string, module: StageModule): number {
  if (module === 'master_carton') {
    const idx = MASTER_CARTON_STAGE_ORDER.indexOf(stage);
    return idx === -1 ? Infinity : idx;
  }
  // child_box: treat SAMPLE and ECOMMERCE as terminal (same as DISPATCHED)
  const terminalChildBoxStages = new Set(['SAMPLE', 'ECOMMERCE', 'DISPATCHED']);
  if (terminalChildBoxStages.has(stage)) {
    // Return the index of DISPATCHED (5) so they sort after PACKED (2)
    return CHILD_BOX_STAGE_ORDER.indexOf('DISPATCHED');
  }
  const idx = CHILD_BOX_STAGE_ORDER.indexOf(stage);
  return idx === -1 ? Infinity : idx;
}

/**
 * Permission-based middleware (Phase 1A addition).
 *
 * - Loads the user's role and role_permissions in a single JOIN query.
 * - Admin role = super-admin; always passes.
 * - If opts.stageCheck is provided, fetches the resource's current stage and
 *   compares against max_stage in role_permissions for this permission.
 */
export function authorizePermission(
  permission: string,
  opts?: AuthorizePermissionOptions
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }

      // Single query: fetch role name + this specific permission row (if any)
      const result = await query(
        `SELECT r.name AS role_name, rp.permission, rp.max_stage
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN role_permissions rp
           ON rp.role_id = r.id AND rp.permission = $2
         WHERE u.id = $1`,
        [req.user.userId, permission]
      );

      if (result.rows.length === 0) {
        next(new ForbiddenError('User or role not found'));
        return;
      }

      const { role_name, max_stage } = result.rows[0];
      const hasPermission: boolean = result.rows[0].permission !== null;

      // Super-admin bypass — Admin role always passes
      if (role_name === 'Admin') {
        next();
        return;
      }

      if (!hasPermission) {
        next(new ForbiddenError(`Required permission: ${permission}`));
        return;
      }

      // Stage check (optional)
      if (opts?.stageCheck) {
        const resourceId = opts.stageCheck.resourceIdFrom(req);
        const module = opts.stageCheck.module;

        // Fetch resource's current stage
        let resourceStage: string | null = null;
        if (module === 'master_carton') {
          const stageResult = await query(
            'SELECT status FROM master_cartons WHERE id = $1',
            [resourceId]
          );
          if (stageResult.rows.length > 0) {
            resourceStage = stageResult.rows[0].status as string;
          }
        } else {
          const stageResult = await query(
            'SELECT status FROM child_boxes WHERE id = $1',
            [resourceId]
          );
          if (stageResult.rows.length > 0) {
            resourceStage = stageResult.rows[0].status as string;
          }
        }

        if (resourceStage && max_stage) {
          const resourceStageIdx = stageIndex(resourceStage, module);
          const maxStageIdx = stageIndex(max_stage, module);

          if (resourceStageIdx > maxStageIdx) {
            next(
              new ForbiddenError(
                `Permission denied: ${permission} is restricted at stage ${resourceStage} ` +
                  `(your role allows up to ${max_stage})`
              )
            );
            return;
          }
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
