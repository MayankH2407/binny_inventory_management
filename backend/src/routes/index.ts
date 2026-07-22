import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import productRoutes from './product.routes';
import sectionRoutes from './section.routes';
import childBoxRoutes from './childBox.routes';
import masterCartonRoutes from './masterCarton.routes';
import inventoryRoutes from './inventory.routes';
import dispatchRoutes from './dispatch.routes';
import returnRoutes from './return.routes';
import reportRoutes from './report.routes';
import customerRoutes from './customer.routes';
import sampleRoutes from './sample.routes';
import ecommerceRoutes from './ecommerce.routes';
import roleRoutes from './role.routes';
import permissionRoutes from './permission.routes';

const router = Router();

// Health check (before auth-protected routes)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', permissionRoutes);
router.use('/products', productRoutes);
router.use('/sections', sectionRoutes);
router.use('/child-boxes', childBoxRoutes);
router.use('/master-cartons', masterCartonRoutes);
router.use('/samples', sampleRoutes);
router.use('/ecommerce', ecommerceRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/dispatches', dispatchRoutes);
router.use('/returns', returnRoutes);
router.use('/reports', reportRoutes);
router.use('/customers', customerRoutes);

export default router;
