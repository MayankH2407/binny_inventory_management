import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { rateLimiter } from '../middleware/rateLimiter.middleware';
import { loginSchema, changePasswordSchema } from '../models/schemas/auth.schema';
import { RATE_LIMIT } from '../config/constants';

const router = Router();

// Rate limit auth endpoints more aggressively
const authRateLimit = rateLimiter({
  windowMs: RATE_LIMIT.AUTH_WINDOW_MS,
  maxRequests: RATE_LIMIT.AUTH_MAX_REQUESTS,
  message: 'Too many authentication attempts, please try again later',
});

router.post(
  '/login',
  authRateLimit,
  validate({ body: loginSchema }),
  authController.login
);

router.post(
  '/refresh',
  authRateLimit,
  authController.refreshToken
);

router.post(
  '/logout',
  authenticate,
  authController.logout
);

router.put(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);

router.get(
  '/profile',
  authenticate,
  authController.getProfile
);

export default router;
