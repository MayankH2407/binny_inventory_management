import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/dashboard', inventoryController.getDashboard);
router.get('/transactions', inventoryController.getTransactions);
router.get('/trace/:barcode', inventoryController.traceByBarcode);

export default router;
