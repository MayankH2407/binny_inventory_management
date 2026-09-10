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

// CSV export of dispatch details for a date range. Placed before '/:id' so
// 'export' is not captured as an id. Gated the same as the list (authenticate
// only) so dispatch staff without reports:view_all can still export.
router.get(
  '/export',
  validate({ query: dispatchListQuerySchema }),
  dispatchController.exportDispatches
);

// Same party-wise aggregation as /export, returned as JSON so the frontend
// can render it into a printable PDF summary — kept as one shared query
// (csvExportService.getPartyWiseDispatchRows) so the two downloads offered
// from the same date range never disagree.
router.get(
  '/export/summary',
  validate({ query: dispatchListQuerySchema }),
  dispatchController.getDispatchSummaryData
);

router.get(
  '/:id',
  validate({ params: dispatchIdParamSchema }),
  dispatchController.getDispatchById
);

export default router;
