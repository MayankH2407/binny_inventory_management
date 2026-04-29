import { Router } from 'express';
import * as childBoxController from '../controllers/childBox.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createChildBoxSchema,
  createBulkChildBoxSchema,
  createBulkMultiSizeChildBoxSchema,
  childBoxIdParamSchema,
  childBoxListQuerySchema,
} from '../models/schemas/childBox.schema';
import { csvUpload } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.get(
  '/bulk-upload/sample',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  childBoxController.getBulkUploadSample
);

router.post(
  '/bulk-upload',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  csvUpload.single('file'),
  childBoxController.bulkUploadChildBoxes
);

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

router.post(
  '/bulk-multi-size',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: createBulkMultiSizeChildBoxSchema }),
  childBoxController.createBulkMultiSizeChildBoxes
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

router.post(
  '/:id/activate',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR, USER_ROLES.DISPATCH_OPERATOR),
  childBoxController.activateChildBox
);

router.get(
  '/:id',
  validate({ params: childBoxIdParamSchema }),
  childBoxController.getChildBoxById
);

export default router;
