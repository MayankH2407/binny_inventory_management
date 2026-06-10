import { Router } from 'express';
import * as dispatchController from '../controllers/dispatch.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createDispatchSchema,
  dispatchIdParamSchema,
  dispatchListQuerySchema,
} from '../models/schemas/dispatch.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('dispatch:create'),
  validate({ body: createDispatchSchema }),
  dispatchController.createDispatch
);

router.get(
  '/',
  validate({ query: dispatchListQuerySchema }),
  dispatchController.getDispatches
);

router.get(
  '/:id',
  validate({ params: dispatchIdParamSchema }),
  dispatchController.getDispatchById
);

export default router;
