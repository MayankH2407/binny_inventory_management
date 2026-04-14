import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import productRoutes from './product.routes';
import sectionRoutes from './section.routes';
import childBoxRoutes from './childBox.routes';
import masterCartonRoutes from './masterCarton.routes';
import inventoryRoutes from './inventory.routes';
import dispatchRoutes from './dispatch.routes';
import reportRoutes from './report.routes';
import customerRoutes from './customer.routes';

const router = Router();

// Health check (before auth-protected routes)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/sections', sectionRoutes);
router.use('/child-boxes', childBoxRoutes);
router.use('/master-cartons', masterCartonRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/dispatches', dispatchRoutes);
router.use('/reports', reportRoutes);
router.use('/customers', customerRoutes);

export default router;
