import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function checkEmailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const result = await authService.checkEmail(email);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body;
    const result = await authService.verifyEmail(token);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function resendVerificationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const result = await authService.resendVerification(email);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function forgotPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const frontendUrl = req.headers.origin || undefined;
    await authService.forgotPassword(email, frontendUrl);
    // Always return success to prevent email enumeration
    res.json({ data: { message: "If an account exists with this email, a password reset link has been sent." } });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    res.json({ data: { message: "Password reset successfully." } });
  } catch (err) {
    next(err);
  }
}

export async function changePasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.id, req.user!.email, currentPassword, newPassword);
    res.json({ data: { message: "Password changed successfully." } });
  } catch (err) {
    next(err);
  }
}
