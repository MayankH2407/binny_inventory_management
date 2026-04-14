import { Router } from 'express';
import * as sectionController from '../controllers/section.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createSectionSchema,
  updateSectionSchema,
  sectionIdParamSchema,
} from '../models/schemas/section.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN),
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
  authorize(USER_ROLES.ADMIN),
  validate({ params: sectionIdParamSchema, body: updateSectionSchema }),
  sectionController.updateSection
);

router.delete(
  '/:id',
  authorize(USER_ROLES.ADMIN),
  validate({ params: sectionIdParamSchema }),
  sectionController.deleteSection
);

export default router;
