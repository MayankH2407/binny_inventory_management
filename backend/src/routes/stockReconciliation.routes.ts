import { Router } from 'express';
import * as stockReconController from '../controllers/stockReconciliation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  openSessionSchema,
  submitScansSchema,
  rejectSessionSchema,
  sessionIdParamSchema,
  sessionListQuerySchema,
  varianceQuerySchema,
  scanHistoryQuerySchema,
} from '../models/schemas/stockReconciliation.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('stock_reconciliation:count'),
  validate({ body: openSessionSchema }),
  stockReconController.openSession
);

router.get(
  '/',
  authorizePermission('stock_reconciliation:read'),
  validate({ query: sessionListQuerySchema }),
  stockReconController.getSessions
);

router.get(
  '/:id',
  authorizePermission('stock_reconciliation:read'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.getSessionById
);

router.get(
  '/:id/progress',
  authorizePermission('stock_reconciliation:read'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.getProgress
);

router.post(
  '/:id/scans',
  authorizePermission('stock_reconciliation:count'),
  validate({ params: sessionIdParamSchema, body: submitScansSchema }),
  stockReconController.submitScans
);

router.get(
  '/:id/scans',
  authorizePermission('stock_reconciliation:read'),
  validate({ params: sessionIdParamSchema, query: scanHistoryQuerySchema }),
  stockReconController.getScans
);

router.get(
  '/:id/variance',
  authorizePermission('stock_reconciliation:read'),
  validate({ params: sessionIdParamSchema, query: varianceQuerySchema }),
  stockReconController.getVariance
);

router.post(
  '/:id/submit',
  authorizePermission('stock_reconciliation:count'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.submitSession
);

router.post(
  '/:id/cancel',
  authorizePermission('stock_reconciliation:count'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.cancelSession
);

router.post(
  '/:id/approve',
  authorizePermission('stock_reconciliation:approve'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.approveSession
);

router.post(
  '/:id/reject',
  authorizePermission('stock_reconciliation:approve'),
  validate({ params: sessionIdParamSchema, body: rejectSessionSchema }),
  stockReconController.rejectSession
);

router.post(
  '/:id/post',
  authorizePermission('stock_reconciliation:post'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.postSession
);

router.post(
  '/:id/recount',
  authorizePermission('stock_reconciliation:count'),
  validate({ params: sessionIdParamSchema }),
  stockReconController.recountSession
);

export default router;
