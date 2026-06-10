import { Router } from 'express';
import * as customerController from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { csvUpload } from '../middleware/upload.middleware';
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
  authorizePermission('customers:create'),
  validate({ body: createCustomerSchema }),
  customerController.createCustomer
);

// ── Bulk CSV upload (literal paths declared before /:id to avoid shadowing) ──
router.get(
  '/bulk-upload/sample',
  authorizePermission('customers:read'),
  customerController.downloadCustomerSampleCsv
);

router.post(
  '/bulk-upload',
  authorizePermission('customers:create'),
  csvUpload.single('file'),
  customerController.bulkUploadCustomers
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
  authorizePermission('customers:update'),
  validate({ params: customerIdParamSchema, body: updateCustomerSchema }),
  customerController.updateCustomer
);

router.delete(
  '/:id',
  authorizePermission('customers:delete'),
  validate({ params: customerIdParamSchema }),
  customerController.deleteCustomer
);

export default router;
