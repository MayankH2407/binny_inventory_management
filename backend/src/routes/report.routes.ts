import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);
router.use(authorizePermission('reports:view_all'));

router.get('/inventory-summary', reportController.getInventorySummary);
router.get('/inventory-summary/export', reportController.exportInventoryCSV);
router.get('/product-wise', reportController.getProductWiseReport);
router.get('/dispatch-summary', reportController.getDispatchSummary);
router.get('/dispatch-summary/export', reportController.exportDispatchCSV);
router.get('/daily-activity', reportController.getDailyActivity);
router.get('/daily-activity/export', reportController.exportDailyActivityCSV);
router.get('/carton-inventory', reportController.getCartonInventoryReport);
router.get('/samples', reportController.getSampleReport);
router.get('/samples/export', reportController.exportSampleReportCSV);
router.get('/ecommerce', reportController.getEcommerceReport);
router.get('/ecommerce/export', reportController.exportEcommerceReportCSV);

export default router;
