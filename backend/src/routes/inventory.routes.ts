import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { cartonHierarchyQuerySchema, inventoryBreakdownQuerySchema } from '../models/schemas/inventory.schema';

const router = Router();

router.use(authenticate);

router.get('/dashboard', inventoryController.getDashboard);
router.get('/stock/summary', inventoryController.getStockSummary);
router.get('/stock/hierarchy', inventoryController.getStockHierarchy);
router.get('/transactions', authorizePermission('inventory:read'), inventoryController.getTransactions);
router.get('/cartons/hierarchy', validate({ query: cartonHierarchyQuerySchema }), inventoryController.getCartonHierarchy);
router.get('/cartons/export', authorizePermission('inventory:read'), inventoryController.exportCartonHierarchyCsv);
router.get('/trace/:barcode', inventoryController.traceByBarcode);
router.get('/breakdown', validate({ query: inventoryBreakdownQuerySchema }), inventoryController.getInventoryBreakdown);

export default router;
