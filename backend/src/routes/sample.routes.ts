import { Router } from 'express';
import * as sampleController from '../controllers/sample.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createSampleSchema,
  addBoxToSampleSchema,
  removeBoxFromSampleSchema,
  sampleIdParamSchema,
  sampleListQuerySchema,
  sampleBarcodeParamSchema,
} from '../models/schemas/sample.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: createSampleSchema }),
  sampleController.createSample
);

router.get(
  '/',
  validate({ query: sampleListQuerySchema }),
  sampleController.getSamples
);

router.get(
  '/qr/:barcode',
  validate({ params: sampleBarcodeParamSchema }),
  sampleController.getSampleByBarcode
);

router.get(
  '/:id',
  validate({ params: sampleIdParamSchema }),
  sampleController.getSampleById
);

router.get(
  '/:id/children',
  validate({ params: sampleIdParamSchema }),
  sampleController.getSampleChildren
);

router.get(
  '/:id/assortment',
  validate({ params: sampleIdParamSchema }),
  sampleController.getSampleAssortment
);

router.post(
  '/:id/full-unpack',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ params: sampleIdParamSchema }),
  sampleController.fullUnpackSample
);

router.post(
  '/add-box',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: addBoxToSampleSchema }),
  sampleController.addBoxToSample
);

router.post(
  '/remove-box',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: removeBoxFromSampleSchema }),
  sampleController.removeBoxFromSample
);

router.post(
  '/:id/close',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ params: sampleIdParamSchema }),
  sampleController.closeSample
);

export default router;
