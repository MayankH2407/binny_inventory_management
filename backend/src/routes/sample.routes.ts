import { Router } from 'express';
import * as sampleController from '../controllers/sample.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createSampleSchema,
  sampleScanSchema,
  sampleUnpackSchema,
  sampleItemActionSchema,
  sampleSetFootSchema,
  sampleIdParamSchema,
  sampleListQuerySchema,
  sampleBarcodeParamSchema,
  sampleLookupBarcodeParamSchema,
} from '../models/schemas/sample.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('samples:create'),
  validate({ body: createSampleSchema }),
  sampleController.createSample
);

router.get(
  '/',
  validate({ query: sampleListQuerySchema }),
  sampleController.getSamples
);

// Literal paths declared before /:id to avoid shadowing.
router.get('/summary', sampleController.getSampleSummary);

router.get(
  '/qr/:barcode',
  validate({ params: sampleBarcodeParamSchema }),
  sampleController.getSampleByBarcode
);

router.get(
  '/lookup/:barcode',
  validate({ params: sampleLookupBarcodeParamSchema }),
  sampleController.lookupSampleItem
);

router.get(
  '/:id',
  validate({ params: sampleIdParamSchema }),
  sampleController.getSampleById
);

router.get(
  '/:id/contents',
  validate({ params: sampleIdParamSchema }),
  sampleController.getSampleContents
);

router.get(
  '/:id/assortment',
  validate({ params: sampleIdParamSchema }),
  sampleController.getSampleAssortment
);

router.post(
  '/:id/scan',
  authorizePermission('samples:update'),
  validate({ params: sampleIdParamSchema, body: sampleScanSchema }),
  sampleController.addToSample
);

router.post(
  '/:id/unpack-carton',
  authorizePermission('samples:update'),
  validate({ params: sampleIdParamSchema, body: sampleUnpackSchema }),
  sampleController.unpackCartonInSample
);

router.post(
  '/:id/set-foot',
  authorizePermission('samples:update'),
  validate({ params: sampleIdParamSchema, body: sampleSetFootSchema }),
  sampleController.setBoxFoot
);

router.post(
  '/:id/remove',
  authorizePermission('samples:delete'),
  validate({ params: sampleIdParamSchema, body: sampleItemActionSchema }),
  sampleController.removeFromSample
);

router.post(
  '/:id/clear',
  authorizePermission('samples:delete'),
  validate({ params: sampleIdParamSchema }),
  sampleController.clearSample
);

router.delete(
  '/:id',
  authorizePermission('samples:delete'),
  validate({ params: sampleIdParamSchema }),
  sampleController.deleteSampleRecord
);

export default router;
