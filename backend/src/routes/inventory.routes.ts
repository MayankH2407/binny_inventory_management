import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(authenticate);

router.get('/dashboard', inventoryController.getDashboard);
router.get('/stock/summary', inventoryController.getStockSummary);
router.get('/stock/hierarchy', inventoryController.getStockHierarchy);
router.get('/transactions', authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR), inventoryController.getTransactions);
router.get('/trace/:barcode', inventoryController.traceByBarcode);

export default router;
