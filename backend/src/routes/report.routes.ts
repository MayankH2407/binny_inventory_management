import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(authenticate);
router.use(authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR));

router.get('/inventory-summary', reportController.getInventorySummary);
router.get('/inventory-summary/export', reportController.exportInventoryCSV);
router.get('/product-wise', reportController.getProductWiseReport);
router.get('/dispatch-summary', reportController.getDispatchSummary);
router.get('/dispatch-summary/export', reportController.exportDispatchCSV);
router.get('/daily-activity', reportController.getDailyActivity);
router.get('/daily-activity/export', reportController.exportDailyActivityCSV);
router.get('/carton-inventory', reportController.getCartonInventoryReport);

export default router;
