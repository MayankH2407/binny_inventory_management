import { Router } from 'express';
import * as masterCartonController from '../controllers/masterCarton.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { csvUpload } from '../middleware/upload.middleware';
import {
  createMasterCartonSchema,
  packChildBoxSchema,
  unpackChildBoxSchema,
  packByBarcodeSchema,
  masterCartonIdParamSchema,
  masterCartonListQuerySchema,
  masterCartonBarcodeParamSchema,
} from '../models/schemas/masterCarton.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('cartons:create'),
  validate({ body: createMasterCartonSchema }),
  masterCartonController.createMasterCarton
);

router.get(
  '/',
  validate({ query: masterCartonListQuerySchema }),
  masterCartonController.getMasterCartons
);

// ── Legacy carton upload routes (must be BEFORE /:id to avoid shadowing) ─────

router.get(
  '/legacy-upload/sample',
  authorizePermission('cartons:read'),
  masterCartonController.downloadLegacySampleCsv
);

router.post(
  '/legacy-upload',
  authorizePermission('cartons:create'),
  csvUpload.single('file'),
  masterCartonController.bulkUploadLegacyCartons
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
  authorizePermission('packing:unpack'),
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.fullUnpackMasterCarton
);

router.post(
  '/:id/open-legacy',
  authorizePermission('packing:unpack'),
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.openLegacyCarton
);

router.post(
  '/pack',
  authorizePermission('packing:pack'),
  validate({ body: packChildBoxSchema }),
  masterCartonController.packChildBox
);

router.post(
  '/pack-by-barcode',
  authorizePermission('packing:pack'),
  validate({ body: packByBarcodeSchema }),
  masterCartonController.packChildBoxByBarcode
);

router.post(
  '/unpack',
  authorizePermission('packing:unpack'),
  validate({ body: unpackChildBoxSchema }),
  masterCartonController.unpackChildBox
);

router.post(
  '/:id/close',
  authorizePermission('cartons:close'),
  validate({ params: masterCartonIdParamSchema }),
  masterCartonController.closeMasterCarton
);

export default router;
