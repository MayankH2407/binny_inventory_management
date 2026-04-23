import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  productListQuerySchema,
  bulkCreateBySizeRangeSchema,
} from '../models/schemas/product.schema';
import { productImageUpload, csvUpload } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.get(
  '/bulk-upload/sample',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  productController.downloadSampleCsv
);

router.post(
  '/bulk-upload',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  csvUpload.single('file'),
  productController.bulkUploadProducts
);

router.post(
  '/bulk-size-range',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ body: bulkCreateBySizeRangeSchema }),
  productController.bulkCreateBySizeRange
);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ body: createProductSchema }),
  productController.createProduct
);

router.get(
  '/',
  validate({ query: productListQuerySchema }),
  productController.getProducts
);

router.get(
  '/:id/colours',
  validate({ params: productIdParamSchema }),
  productController.getProductColours
);

router.get(
  '/:id/sizes',
  validate({ params: productIdParamSchema }),
  productController.getProductSizes
);

router.post(
  '/:id/image',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  productImageUpload.single('image'),
  productController.uploadProductImage
);

router.get(
  '/:id',
  validate({ params: productIdParamSchema }),
  productController.getProductById
);

router.put(
  '/:id',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  productController.updateProduct
);

router.delete(
  '/:id',
  authorize(USER_ROLES.ADMIN),
  validate({ params: productIdParamSchema }),
  productController.deleteProduct
);

export default router;
