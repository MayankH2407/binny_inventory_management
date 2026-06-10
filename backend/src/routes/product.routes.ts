import { Router } from 'express';
import * as productController from '../controllers/product.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
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
  authorizePermission('products:read'),
  productController.downloadSampleCsv
);

router.post(
  '/bulk-upload',
  authorizePermission('products:create'),
  csvUpload.single('file'),
  productController.bulkUploadProducts
);

router.post(
  '/bulk-size-range',
  authorizePermission('products:create'),
  validate({ body: bulkCreateBySizeRangeSchema }),
  productController.bulkCreateBySizeRange
);

router.post(
  '/',
  authorizePermission('products:create'),
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
  authorizePermission('products:update'),
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
  authorizePermission('products:update'),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  productController.updateProduct
);

router.delete(
  '/:id',
  authorizePermission('products:delete'),
  validate({ params: productIdParamSchema }),
  productController.deleteProduct
);

export default router;
