import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { createServerSupabase } from "../../shared/database";
import {
  checkAccountLockout,
  recordFailedLogin,
  clearFailedLogins,
  sanitizeEmail,
  generateSecureToken,
  isValidTokenFormat,
} from "../../shared/security";
import { getResend, getFromEmail } from "../../shared/resend";
import { getPasswordResetEmailHtml, getPasswordResetEmailText } from "../../shared/email-templates";
import { getNovu } from "../../shared/novu";
import {
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
} from "../../shared/errors";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; firstName?: string; lastName?: string };
  isNewUser?: boolean;
}

export function signAccessToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRY } as SignOptions);
}

export function signRefreshToken(payload: { id: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRY } as SignOptions);
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const cleanEmail = sanitizeEmail(email);

  // Check lockout
  const lockout = checkAccountLockout(cleanEmail);
  if (lockout.isLocked) {
    const minutes = Math.ceil((lockout.remainingTime || 0) / 60);
    throw new TooManyRequestsError(
      `Account temporarily locked. Try again in ${minutes} minutes.`
    );
  }

  const supabase = createServerSupabase();
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, password_hash, role, email_verified, last_login_at")
    .eq("email", cleanEmail)
    .single();

  if (error || !user) {
    recordFailedLogin(cleanEmail);
    throw new UnauthorizedError("No account found with this email. Please sign up first.");
  }

  // SSO-only users don't have a password
  if (!user.password_hash) {
    throw new UnauthorizedError(
      "This account was registered with social sign-in. Please use Google, LinkedIn, or Facebook to log in."
    );
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const result = recordFailedLogin(cleanEmail);
    if (result.shouldLockout) {
      throw new TooManyRequestsError(
        "Too many failed attempts. Account locked for 30 minutes."
      );
    }
    throw new UnauthorizedError("Incorrect password. Please try again or reset your password.");
  }

  clearFailedLogins(cleanEmail);

  // Check email verification for manual sign-up users
  if (user.email_verified === false) {
    throw new UnauthorizedError(
      "Please verify your email before signing in. Check your inbox for the verification link."
    );
  }

  // Get nurse profile for name
  let firstName: string | undefined;
  let lastName: string | undefined;
  if (user.role === "nurse") {
    const { data: profile } = await supabase
      .from("nurse_profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .single();
    firstName = profile?.first_name;
    lastName = profile?.last_name;
  }

  // Identify Novu subscriber
  const novu = getNovu();
  if (novu) {
    try {
      await novu.subscribers.identify(user.id, {
        email: user.email,
        firstName,
        lastName,
      });
      if (user.role === "nurse") {
        await novu.topics.addSubscribers("nurses", { subscribers: [user.id] });
      }
    } catch (err) {
      console.error("Novu subscriber identify failed:", err);
    }
  }

  const isNewUser = !user.last_login_at;

  // Update last_login_at
  await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ id: user.id });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role, firstName, lastName },
    isNewUser,
  };
}

export async function checkEmail(email: string): Promise<{ exists: boolean; hasPassword: boolean; provider?: string }> {
  const cleanEmail = sanitizeEmail(email);
  const supabase = createServerSupabase();

  const { data: user } = await supabase
    .from("users")
    .select("id, password_hash")
    .eq("email", cleanEmail)
    .single();

  if (!user) {
    return { exists: false, hasPassword: false };
  }

  // Check if user has an SSO provider linked
  if (!user.password_hash) {
    const { data: ssoLink } = await supabase
      .from("user_sso_providers")
      .select("provider")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    return { exists: true, hasPassword: false, provider: ssoLink?.provider || "social" };
  }

  return { exists: true, hasPassword: true };
}

export async function register(data: {
  email: string;
  password: string;
}): Promise<{ message: string }> {
  const cleanEmail = sanitizeEmail(data.email);
  const supabase = createServerSupabase();

  // Check existing user
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", cleanEmail)
    .single();

  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const password_hash = await bcrypt.hash(data.password, 12);

  // Create user with email_verified = false
  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({ email: cleanEmail, password_hash, role: "nurse", email_verified: false })
    .select("id")
    .single();

  if (userError || !user) {
    throw new Error("Failed to create account");
  }

  // Create empty nurse profile — user fills in details on their profile page
  const { error: profileError } = await supabase
    .from("nurse_profiles")
    .insert({
      user_id: user.id,
      first_name: "",
      last_name: "",
      phone: "",
      country: "Philippines",
      years_of_experience: 0,
      profile_complete: false,
    });

  if (profileError) {
    console.error("Profile creation error:", profileError);
    await supabase.from("users").delete().eq("id", user.id);
    throw new Error("Failed to create profile");
  }

  // Send verification email
  await sendVerificationEmail(user.id, cleanEmail, "");

  return { message: "Account created. Please check your email to verify your account." };
}

export async function sendVerificationEmail(userId: string, email: string, firstName: string): Promise<void> {
  const supabase = createServerSupabase();

  // Invalidate existing tokens
  await supabase
    .from("email_verification_tokens")
    .update({ used: true })
    .eq("user_id", userId)
    .eq("used", false);

  const token = await generateSecureToken(32);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error: tokenError } = await supabase
    .from("email_verification_tokens")
    .insert({
      user_id: userId,
      token,
      expires_at: expiresAt.toISOString(),
    });

  if (tokenError) throw new Error("Failed to create verification token");

  const baseUrl = env.CORS_ORIGIN || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  const { getVerificationEmailHtml, getVerificationEmailText } = require("../../shared/email-templates");

  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({
        from: getFromEmail(),
        to: email,
        subject: "Verify Your Email - Nurse Care Pro",
        html: getVerificationEmailHtml({ userName: firstName || email.split("@")[0], verifyUrl, expiryTime: "24 hours" }),
        text: getVerificationEmailText({ userName: firstName || email.split("@")[0], verifyUrl, expiryTime: "24 hours" }),
      });
    } catch (err) {
      console.error("Error sending verification email:", err);
    }
  } else {
    console.log("Resend not configured. Verification URL:", verifyUrl);
  }
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  if (!isValidTokenFormat(token)) {
    throw new BadRequestError("Invalid or expired verification token");
  }

  const supabase = createServerSupabase();

  const { data: verificationToken, error: tokenError } = await supabase
    .from("email_verification_tokens")
    .select("*")
    .eq("token", token)
    .eq("used", false)
    .single();

  if (tokenError || !verificationToken) {
    throw new BadRequestError("Invalid or expired verification token");
  }

  if (new Date() > new Date(verificationToken.expires_at)) {
    await supabase.from("email_verification_tokens").update({ used: true }).eq("id", verificationToken.id);
    throw new BadRequestError("Verification token has expired. Please request a new one.");
  }

  // Mark email as verified
  const { error: updateError } = await supabase
    .from("users")
    .update({ email_verified: true })
    .eq("id", verificationToken.user_id);

  if (updateError) throw new Error("Failed to verify email");

  // Invalidate all tokens for this user
  await supabase
    .from("email_verification_tokens")
    .update({ used: true })
    .eq("user_id", verificationToken.user_id)
    .eq("used", false);

  return { message: "Email verified successfully. You can now sign in." };
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  const cleanEmail = sanitizeEmail(email);
  const supabase = createServerSupabase();

  const { data: user } = await supabase
    .from("users")
    .select("id, email_verified")
    .eq("email", cleanEmail)
    .single();

  // Don't reveal if email exists
  if (!user || user.email_verified) {
    // Return success regardless to prevent email enumeration
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { message: "If an unverified account exists with this email, a new verification link has been sent." };
  }

  // Get first name for email
  const { data: profile } = await supabase
    .from("nurse_profiles")
    .select("first_name")
    .eq("user_id", user.id)
    .single();

  await sendVerificationEmail(user.id, cleanEmail, profile?.first_name || "");

  return { message: "If an unverified account exists with this email, a new verification link has been sent." };
}

export async function refreshAccessToken(refreshTokenStr: string): Promise<{ accessToken: string; refreshToken: string }> {
  try {
    const decoded = jwt.verify(refreshTokenStr, env.JWT_SECRET) as { id: string };
    const supabase = createServerSupabase();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, role")
      .eq("id", decoded.id)
      .single();

    if (error || !user) throw new UnauthorizedError("Invalid refresh token");

    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id });
    return { accessToken, refreshToken };
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
}

export async function forgotPassword(email: string, frontendUrl?: string): Promise<void> {
  const cleanEmail = sanitizeEmail(email);
  const supabase = createServerSupabase();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select(`id, email, nurse_profiles (first_name, last_name)`)
    .eq("email", cleanEmail)
    .single();

  if (userError || !user) {
    // Prevent timing attacks
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }

  const resetToken = await generateSecureToken(32);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  // Invalidate existing tokens
  await supabase
    .from("password_reset_tokens")
    .update({ used: true })
    .eq("user_id", user.id)
    .eq("used", false);

  const { error: tokenError } = await supabase
    .from("password_reset_tokens")
    .insert({
      user_id: user.id,
      token: resetToken,
      expires_at: expiresAt.toISOString(),
    });

  if (tokenError) throw new Error("Failed to create reset token");

  const baseUrl = frontendUrl || env.CORS_ORIGIN || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const userProfile = Array.isArray(user.nurse_profiles)
    ? user.nurse_profiles[0]
    : user.nurse_profiles;
  const userName = userProfile?.first_name
    ? `${userProfile.first_name} ${userProfile.last_name || ""}`.trim()
    : cleanEmail.split("@")[0];

  const resend = getResend();
  if (resend) {
    try {
      await resend.emails.send({
        from: getFromEmail(),
        to: cleanEmail,
        subject: "Reset Your Password - Nurse Care Pro",
        html: getPasswordResetEmailHtml({ userName, resetUrl, expiryTime: "1 hour" }),
        text: getPasswordResetEmailText({ userName, resetUrl, expiryTime: "1 hour" }),
      });
    } catch (err) {
      console.error("Error sending reset email:", err);
    }
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!isValidTokenFormat(token)) {
    throw new BadRequestError("Invalid or expired reset token");
  }

  const supabase = createServerSupabase();

  const { data: resetToken, error: tokenError } = await supabase
    .from("password_reset_tokens")
    .select("*")
    .eq("token", token)
    .eq("used", false)
    .single();

  if (tokenError || !resetToken) {
    throw new BadRequestError("Invalid or expired reset token");
  }

  if (new Date() > new Date(resetToken.expires_at)) {
    await supabase.from("password_reset_tokens").update({ used: true }).eq("id", resetToken.id);
    throw new BadRequestError("Reset token has expired. Please request a new one.");
  }

  const { data: currentUser, error: userError } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", resetToken.user_id)
    .single();

  if (userError || !currentUser) throw new NotFoundError("User not found");

  const isSame = await bcrypt.compare(newPassword, currentUser.password_hash);
  if (isSame) throw new BadRequestError("New password must be different from current password");

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const { error: updateError } = await supabase
    .from("users")
    .update({ password_hash: hashedPassword })
    .eq("id", resetToken.user_id);

  if (updateError) throw new Error("Failed to update password");

  // Invalidate all tokens for this user
  await supabase
    .from("password_reset_tokens")
    .update({ used: true })
    .eq("user_id", resetToken.user_id)
    .eq("used", false);
}

export async function changePassword(
  userId: string,
  userEmail: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const supabase = createServerSupabase();

  const { data: user, error } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", userId)
    .single();

  if (error || !user) throw new NotFoundError("User not found");

  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) {
    const result = recordFailedLogin(userEmail);
    if (result.shouldLockout) {
      throw new TooManyRequestsError("Too many failed attempts. Account locked for 30 minutes.");
    }
    throw new BadRequestError(
      `Current password is incorrect. ${result.attemptsRemaining} attempts remaining.`
    );
  }

  clearFailedLogins(userEmail);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const { error: updateError } = await supabase
    .from("users")
    .update({ password_hash: hashedPassword })
    .eq("id", userId);

  if (updateError) throw new Error("Failed to update password");
}
