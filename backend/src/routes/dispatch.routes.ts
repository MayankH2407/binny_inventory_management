import { Router } from 'express';
import * as dispatchController from '../controllers/dispatch.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createDispatchSchema,
  dispatchIdParamSchema,
  dispatchListQuerySchema,
} from '../models/schemas/dispatch.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR, USER_ROLES.DISPATCH_OPERATOR),
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
