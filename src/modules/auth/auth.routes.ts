import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import {
  loginRateLimit,
  forgotPasswordRateLimit,
  resetPasswordRateLimit,
  changePasswordRateLimit,
} from "../../middleware/rate-limit";
import {
  loginSchema,
  checkEmailSchema,
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../../shared/validators";
import * as controller from "./auth.controller";
import * as ssoController from "./sso.controller";

const router = Router();

router.post("/login", loginRateLimit, validate(loginSchema), controller.loginHandler);
router.post("/check-email", validate(checkEmailSchema), controller.checkEmailHandler);
router.post("/register", validate(registerSchema), controller.registerHandler);
router.post("/verify-email", validate(verifyEmailSchema), controller.verifyEmailHandler);
router.post("/resend-verification", validate(resendVerificationSchema), controller.resendVerificationHandler);
router.post("/refresh", controller.refreshHandler);
router.post("/forgot-password", forgotPasswordRateLimit, validate(forgotPasswordSchema), controller.forgotPasswordHandler);
router.post("/reset-password", resetPasswordRateLimit, validate(resetPasswordSchema), controller.resetPasswordHandler);
router.post("/change-password", authenticate, changePasswordRateLimit, validate(changePasswordSchema), controller.changePasswordHandler);

// SSO routes
router.get("/sso/:provider", ssoController.initiateSSO);
router.get("/sso/:provider/callback", ssoController.handleSSOCallback);

export { router as authRoutes };
