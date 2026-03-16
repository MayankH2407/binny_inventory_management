import { Router } from 'express';
import * as masterCartonController from '../controllers/masterCarton.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createMasterCartonSchema,
  packChildBoxSchema,
  unpackChildBoxSchema,
  repackChildBoxSchema,
  masterCartonIdParamSchema,
  masterCartonListQuerySchema,
  masterCartonBarcodeParamSchema,
} from '../models/schemas/masterCarton.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: createMasterCartonSchema }),
  masterCartonController.createMasterCarton
);

router.get(
  '/',
  validate({ query: masterCartonListQuerySchema }),
  masterCartonController.getMasterCartons
);

router.get(
  '/qr/:barcode',
  validate({ params: masterCartonBarcodeParamSchema }),
  masterCartonController.getMasterCartonByBarcode
);

router.get(
  '/:id',
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.getMasterCartonById
);

router.get(
  '/:id/children',
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.getCartonChildren
);

router.get(
  '/:id/assortment',
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.getAssortmentSummary
);

router.post(
  '/:id/full-unpack',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.fullUnpackMasterCarton
);

router.post(
  '/pack',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: packChildBoxSchema }),
  masterCartonController.packChildBox
);

router.post(
  '/unpack',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: unpackChildBoxSchema }),
  masterCartonController.unpackChildBox
);

router.post(
  '/repack',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: repackChildBoxSchema }),
  masterCartonController.repackChildBox
);

router.post(
  '/:id/close',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.closeMasterCarton
);

export default router;
