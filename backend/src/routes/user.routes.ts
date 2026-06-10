import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
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
  authorizePermission('users:create'),
  validate({ body: createUserSchema }),
  userController.createUser
);

router.get(
  '/',
  authorizePermission('users:read'),
  validate({ query: userListQuerySchema }),
  userController.getUsers
);

router.get(
  '/:id',
  authorizePermission('users:read'),
  validate({ params: userIdParamSchema }),
  userController.getUserById
);

router.put(
  '/:id',
  authorizePermission('users:update'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  userController.updateUser
);

router.delete(
  '/:id',
  authorizePermission('users:delete'),
  validate({ params: userIdParamSchema }),
  userController.deleteUser
);

export default router;
