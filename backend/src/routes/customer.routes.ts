import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerIdParamSchema,
  customerListQuerySchema,
} from '../models/schemas/customer.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ body: createCustomerSchema }),
  customerController.createCustomer
);

router.get(
  '/',
  validate({ query: customerListQuerySchema }),
  customerController.getCustomers
);

router.get('/primary-dealers', customerController.getPrimaryDealers);

router.get(
  '/:id/sub-dealers',
  validate({ params: customerIdParamSchema }),
  customerController.getSubDealers
);

router.get(
  '/:id',
  validate({ params: customerIdParamSchema }),
  customerController.getCustomerById
);

router.put(
  '/:id',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ params: customerIdParamSchema, body: updateCustomerSchema }),
  customerController.updateCustomer
);

router.delete(
  '/:id',
  authorize(USER_ROLES.ADMIN),
  validate({ params: customerIdParamSchema }),
  customerController.deleteCustomer
);

export default router;
