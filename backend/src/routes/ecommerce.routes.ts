import { Router } from 'express';
import * as ecommerceController from '../controllers/ecommerce.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createEcommerceSchema,
  addBoxToEcommerceSchema,
  removeBoxFromEcommerceSchema,
  scanCartonToEcommerceSchema,
  ecommerceIdParamSchema,
  ecommerceListQuerySchema,
  ecommerceBarcodeParamSchema,
} from '../models/schemas/ecommerce.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('ecommerce:create'),
  validate({ body: createEcommerceSchema }),
  ecommerceController.createEcommerce
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

router.post(
  '/:id/full-unpack',
  authorizePermission('ecommerce:update'),
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.fullUnpackEcommerce
);

router.post(
  '/add-box',
  authorizePermission('ecommerce:update'),
  validate({ body: addBoxToEcommerceSchema }),
  ecommerceController.addBoxToEcommerce
);

router.post(
  '/scan-carton',
  authorizePermission('ecommerce:update'),
  validate({ body: scanCartonToEcommerceSchema }),
  ecommerceController.scanCartonToEcommerce
);

router.post(
  '/remove-box',
  authorizePermission('ecommerce:update'),
  validate({ body: removeBoxFromEcommerceSchema }),
  ecommerceController.removeBoxFromEcommerce
);

router.post(
  '/:id/close',
  authorizePermission('ecommerce:update'),
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.closeEcommerce
);

export default router;
