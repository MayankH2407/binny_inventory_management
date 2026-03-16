import { Router } from 'express';
import * as childBoxController from '../controllers/childBox.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createChildBoxSchema,
  createBulkChildBoxSchema,
  childBoxIdParamSchema,
  childBoxListQuerySchema,
} from '../models/schemas/childBox.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: createChildBoxSchema }),
  childBoxController.createChildBox
);

router.post(
  '/bulk',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: createBulkChildBoxSchema }),
  childBoxController.createBulkChildBoxes
);

router.get(
  '/',
  validate({ query: childBoxListQuerySchema }),
  childBoxController.getChildBoxes
);

router.get(
  '/free',
  childBoxController.getFreeChildBoxes
);

router.get(
  '/qr/:qrCode',
  childBoxController.getChildBoxByQR
);

router.get(
  '/:id',
  validate({ params: childBoxIdParamSchema }),
  childBoxController.getChildBoxById
);

export default router;
