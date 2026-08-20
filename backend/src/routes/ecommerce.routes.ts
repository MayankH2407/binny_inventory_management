import { Router } from 'express';
import * as ecommerceController from '../controllers/ecommerce.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  ecommerceIdParamSchema,
  ecommerceListQuerySchema,
  ecommerceBarcodeParamSchema,
  poolScanSchema,
  poolItemActionSchema,
  poolUnpackSchema,
  poolListQuerySchema,
  poolBarcodeParamSchema,
} from '../models/schemas/ecommerce.schema';

const router = Router();

router.use(authenticate);

// Literal paths before /:id (and before /qr/:barcode-shaped routes) to avoid shadowing.
router.get(
  '/pool',
  validate({ query: poolListQuerySchema }),
  ecommerceController.getEcommercePool
);

router.get(
  '/pool/summary',
  ecommerceController.getEcommercePoolSummary
);

router.get(
  '/pool/lookup/:barcode',
  validate({ params: poolBarcodeParamSchema }),
  ecommerceController.lookupEcommercePoolItem
);

router.post(
  '/pool/scan',
  authorizePermission('ecommerce:update'),
  validate({ body: poolScanSchema }),
  ecommerceController.addToEcommercePool
);

router.post(
  '/pool/unpack-carton',
  authorizePermission('ecommerce:update'),
  validate({ body: poolUnpackSchema }),
  ecommerceController.unpackCartonInEcommercePool
);

router.post(
  '/pool/remove',
  authorizePermission('ecommerce:delete'),
  validate({ body: poolItemActionSchema }),
  ecommerceController.removeFromEcommercePool
);

router.get(
  '/',
  validate({ query: ecommerceListQuerySchema }),
  ecommerceController.getEcommerceRecords
);

router.get(
  '/qr/:barcode',
  validate({ params: ecommerceBarcodeParamSchema }),
  ecommerceController.getEcommerceByBarcode
);

// Literal paths before /:id to avoid shadowing
router.get(
  '/stock-summary',
  ecommerceController.getEcommerceStockSummary
);

router.get(
  '/summary',
  ecommerceController.getEcommerceSummary
);

router.get(
  '/:id',
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.getEcommerceById
);

router.get(
  '/:id/children',
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.getEcommerceChildren
);

router.get(
  '/:id/assortment',
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.getEcommerceAssortment
);

router.get(
  '/:id/cartons',
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.getEcommerceCartons
);

export default router;
