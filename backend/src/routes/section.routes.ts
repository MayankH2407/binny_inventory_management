import { Router } from 'express';
import * as sectionController from '../controllers/section.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createSectionSchema,
  updateSectionSchema,
  sectionIdParamSchema,
} from '../models/schemas/section.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorizePermission('sections:create'),
  validate({ body: createSectionSchema }),
  sectionController.createSection
);

router.get(
  '/',
  sectionController.getSections
);

router.get(
  '/:id',
  validate({ params: sectionIdParamSchema }),
  sectionController.getSectionById
);

router.put(
  '/:id',
  authorizePermission('sections:update'),
  validate({ params: sectionIdParamSchema, body: updateSectionSchema }),
  sectionController.updateSection
);

router.delete(
  '/:id',
  authorizePermission('sections:delete'),
  validate({ params: sectionIdParamSchema }),
  sectionController.deleteSection
);

export default router;
