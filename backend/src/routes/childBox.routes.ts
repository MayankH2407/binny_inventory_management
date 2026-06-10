import { Router } from 'express';
import * as childBoxController from '../controllers/childBox.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
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
  authorizePermission('child_boxes:read'),
  childBoxController.getBulkUploadSample
);

router.post(
  '/bulk-upload',
  authorizePermission('child_boxes:create'),
  csvUpload.single('file'),
  childBoxController.bulkUploadChildBoxes
);

router.post(
  '/',
  authorizePermission('child_boxes:create'),
  validate({ body: createChildBoxSchema }),
  childBoxController.createChildBox
);

router.post(
  '/bulk',
  authorizePermission('child_boxes:create'),
  validate({ body: createBulkChildBoxSchema }),
  childBoxController.createBulkChildBoxes
);

router.post(
  '/bulk-multi-size',
  authorizePermission('child_boxes:create'),
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
  authorizePermission('child_boxes:update'),
  childBoxController.activateChildBox
);

router.get(
  '/:id',
  validate({ params: childBoxIdParamSchema }),
  childBoxController.getChildBoxById
);

export default router;
