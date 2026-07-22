import { Router } from 'express';
import * as returnController from '../controllers/return.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createReturnSchema,
  returnIdParamSchema,
  returnListQuerySchema,
  lookupBarcodeParamSchema,
  dispatchItemsParamSchema,
} from '../models/schemas/return.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('returns:create'),
  validate({ body: createReturnSchema }),
  returnController.createReturn
);

router.get(
  '/',
  authorizePermission('returns:read'),
  validate({ query: returnListQuerySchema }),
  returnController.getReturns
);

// Placed before '/:id' so 'export' is not captured as an id.
router.get(
  '/export',
  authorizePermission('returns:read'),
  validate({ query: returnListQuerySchema }),
  returnController.exportReturns
);

router.get(
  '/lookup/:barcode',
  authorizePermission('returns:create'),
  validate({ params: lookupBarcodeParamSchema }),
  returnController.lookupReturnable
);

router.get(
  '/dispatch/:id/items',
  authorizePermission('returns:create'),
  validate({ params: dispatchItemsParamSchema }),
  returnController.getDispatchItems
);

router.get(
  '/:id',
  authorizePermission('returns:read'),
  validate({ params: returnIdParamSchema }),
  returnController.getReturnById
);

export default router;
