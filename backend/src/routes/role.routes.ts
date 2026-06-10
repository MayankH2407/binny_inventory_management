import { Router } from 'express';
import * as roleController from '../controllers/role.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createRoleSchema,
  updateRoleSchema,
  roleIdParamSchema,
} from '../models/schemas/role.schema';

const router = Router();

// All role management endpoints require authentication + roles:manage permission
router.use(authenticate);
router.use(authorizePermission('roles:manage'));

// GET /api/v1/roles
router.get('/', roleController.listRoles);

// GET /api/v1/roles/:id
router.get(
  '/:id',
  validate({ params: roleIdParamSchema }),
  roleController.getRoleById
);

// POST /api/v1/roles
router.post(
  '/',
  validate({ body: createRoleSchema }),
  roleController.createRole
);

// PATCH /api/v1/roles/:id
router.patch(
  '/:id',
  validate({ params: roleIdParamSchema, body: updateRoleSchema }),
  roleController.updateRole
);

// DELETE /api/v1/roles/:id
router.delete(
  '/:id',
  validate({ params: roleIdParamSchema }),
  roleController.deleteRole
);

export default router;
