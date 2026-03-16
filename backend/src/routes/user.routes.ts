import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { USER_ROLES } from '../config/constants';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  userListQuerySchema,
} from '../models/schemas/user.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(USER_ROLES.ADMIN),
  validate({ body: createUserSchema }),
  userController.createUser
);

router.get(
  '/',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ query: userListQuerySchema }),
  userController.getUsers
);

router.get(
  '/:id',
  authorize(USER_ROLES.ADMIN, USER_ROLES.SUPERVISOR),
  validate({ params: userIdParamSchema }),
  userController.getUserById
);

router.put(
  '/:id',
  authorize(USER_ROLES.ADMIN),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  userController.updateUser
);

router.delete(
  '/:id',
  authorize(USER_ROLES.ADMIN),
  validate({ params: userIdParamSchema }),
  userController.deleteUser
);

export default router;
