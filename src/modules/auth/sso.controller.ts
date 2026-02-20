import { Request, Response, NextFunction } from "express";
import { passport } from "../../config/passport";
import type { SSOProfile } from "../../config/passport";
import { findOrCreateSSOUser } from "./sso.service";
import { env } from "../../config/env";

const VALID_PROVIDERS = ["google", "facebook", "linkedin"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function isValidProvider(p: string): p is Provider {
  return VALID_PROVIDERS.includes(p as Provider);
}

const backendUrl = `http://localhost:${env.PORT}`;

// ---------------------------------------------------------------------------
// LinkedIn OpenID Connect (manual flow — passport strategy is broken)
// ---------------------------------------------------------------------------

function initiateLinkedIn(_req: Request, res: Response): void {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: `${backendUrl}/api/v1/auth/sso/linkedin/callback`,
    scope: "openid profile email",
    state: Math.random().toString(36).substring(2),
  });
  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`);
}

async function handleLinkedInCallback(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string | undefined;
  const error = req.query.error_description as string | undefined;

  if (error || !code) {
    const msg = error || "LinkedIn authentication was cancelled";
    console.log(`[SSO] LinkedIn auth failed:`, msg);
    res.redirect(`${env.FRONTEND_URL}/sso/callback?error=${encodeURIComponent(msg)}`);
    return;
  }

  try {
    // 1. Exchange authorization code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${backendUrl}/api/v1/auth/sso/linkedin/callback`,
        client_id: env.LINKEDIN_CLIENT_ID,
        client_secret: env.LINKEDIN_CLIENT_SECRET,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[SSO] LinkedIn token exchange failed:", errBody);
      throw new Error("Failed to exchange LinkedIn authorization code");
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // 2. Fetch user profile from LinkedIn's OpenID Connect userinfo endpoint
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      console.error("[SSO] LinkedIn profile fetch failed:", errBody);
      throw new Error("Failed to fetch LinkedIn profile");
    }

    const profile = (await profileRes.json()) as {
      sub: string;
      email?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };

    console.log(`[SSO] LinkedIn profile fetched:`, profile.email || "no email");

    const ssoProfile: SSOProfile = {
      provider: "linkedin",
      providerUserId: profile.sub,
      email: profile.email || "",
      firstName: profile.given_name || "",
      lastName: profile.family_name || "",
      profilePictureUrl: profile.picture,
      rawData: profile as unknown as Record<string, unknown>,
    };

    if (!ssoProfile.email) {
      res.redirect(`${env.FRONTEND_URL}/sso/callback?error=${encodeURIComponent("Email not provided by LinkedIn. Please ensure your email is public.")}`);
      return;
    }

    const result = await findOrCreateSSOUser(ssoProfile);
    redirectWithTokens(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn authentication failed";
    console.error(`[SSO] LinkedIn error:`, message);
    res.redirect(`${env.FRONTEND_URL}/sso/callback?error=${encodeURIComponent(message)}`);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function redirectWithTokens(
  res: Response,
  result: { accessToken: string; refreshToken: string; isNewUser: boolean }
): void {
  const params = new URLSearchParams({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    isNewUser: String(result.isNewUser),
  });
  const redirectUrl = `${env.FRONTEND_URL}/sso/callback?${params.toString()}`;
  console.log(`[SSO] Success! Redirecting to:`, redirectUrl.substring(0, 100) + "...");
  res.redirect(redirectUrl);
}

// ---------------------------------------------------------------------------
// GET /auth/sso/:provider — redirects user to OAuth provider
// ---------------------------------------------------------------------------

export function initiateSSO(req: Request, res: Response, next: NextFunction): void {
  const provider = String(req.params.provider);
  console.log(`[SSO] Initiate called for provider: ${provider}`);

  if (!isValidProvider(provider)) {
    console.log(`[SSO] Invalid provider: ${provider}`);
    res.status(400).json({ error: `Invalid SSO provider: ${provider}` });
    return;
  }

  // LinkedIn uses manual OAuth (passport strategy is broken)
  if (provider === "linkedin") {
    initiateLinkedIn(req, res);
    return;
  }

  const scopes: Record<string, string[]> = {
    google: ["profile", "email"],
    facebook: ["email"],
  };

  console.log(`[SSO] Redirecting to ${provider} with scopes:`, scopes[provider]);
  passport.authenticate(provider, {
    scope: scopes[provider],
    session: false,
  })(req, res, next);
}

// ---------------------------------------------------------------------------
// GET /auth/sso/:provider/callback — handles OAuth callback
// ---------------------------------------------------------------------------

export function handleSSOCallback(req: Request, res: Response, next: NextFunction): void {
  const provider = String(req.params.provider);

  if (!isValidProvider(provider)) {
    res.status(400).json({ error: `Invalid SSO provider: ${provider}` });
    return;
  }

  // LinkedIn uses manual OAuth
  if (provider === "linkedin") {
    handleLinkedInCallback(req, res);
    return;
  }

  passport.authenticate(provider, { session: false }, async (err: Error | null, ssoProfile: SSOProfile | false) => {
    console.log(`[SSO] Callback hit for ${provider}. Error:`, err?.message || "none", "Profile:", ssoProfile ? ssoProfile.email : "false/null");
    try {
      if (err || !ssoProfile) {
        const errorMsg = err?.message || "Authentication failed";
        console.log(`[SSO] Auth failed for ${provider}:`, errorMsg);
        res.redirect(`${env.FRONTEND_URL}/sso/callback?error=${encodeURIComponent(errorMsg)}`);
        return;
      }

      if (!ssoProfile.email) {
        res.redirect(`${env.FRONTEND_URL}/sso/callback?error=${encodeURIComponent("Email not provided by " + provider + ". Please ensure your email is public.")}`);
        return;
      }

      const result = await findOrCreateSSOUser(ssoProfile);
      redirectWithTokens(res, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SSO authentication failed";
      console.error(`[SSO] Error in callback for ${provider}:`, message);
      res.redirect(`${env.FRONTEND_URL}/sso/callback?error=${encodeURIComponent(message)}`);
    }
  })(req, res, next);
}
