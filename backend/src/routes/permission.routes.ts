import { Router } from 'express';
import * as roleController from '../controllers/role.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';

const router = Router();

// GET /api/v1/permissions — returns the full permission catalog
// roles:manage required (Admin only by default)
router.get('/', authenticate, authorizePermission('roles:manage'), roleController.listPermissions);

export default router;
