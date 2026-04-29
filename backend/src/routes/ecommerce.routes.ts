import { Router } from 'express';
import * as ecommerceController from '../controllers/ecommerce.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createEcommerceSchema,
  addBoxToEcommerceSchema,
  removeBoxFromEcommerceSchema,
  ecommerceIdParamSchema,
  ecommerceListQuerySchema,
  ecommerceBarcodeParamSchema,
} from '../models/schemas/ecommerce.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
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
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.fullUnpackEcommerce
);

router.post(
  '/add-box',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: addBoxToEcommerceSchema }),
  ecommerceController.addBoxToEcommerce
);

router.post(
  '/remove-box',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.WAREHOUSE_OPERATOR),
  validate({ body: removeBoxFromEcommerceSchema }),
  ecommerceController.removeBoxFromEcommerce
);

router.post(
  '/:id/close',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ params: ecommerceIdParamSchema }),
  ecommerceController.closeEcommerce
);

export default router;
