import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { env } from "./env";

export interface SSOProfile {
  provider: "google" | "linkedin" | "facebook";
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
  rawData: Record<string, unknown>;
}

const backendUrl = env.NODE_ENV === "production"
  ? env.BACKEND_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : `http://localhost:${env.PORT}`;

// Google Strategy
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${backendUrl}/api/v1/auth/sso/google/callback`,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const ssoProfile: SSOProfile = {
          provider: "google",
          providerUserId: profile.id,
          email: profile.emails?.[0]?.value || "",
          firstName: profile.name?.givenName || "",
          lastName: profile.name?.familyName || "",
          profilePictureUrl: profile.photos?.[0]?.value,
          rawData: profile._json as Record<string, unknown>,
        };
        done(null, ssoProfile);
      }
    )
  );
}

// Facebook Strategy
if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: env.FACEBOOK_CLIENT_ID,
        clientSecret: env.FACEBOOK_CLIENT_SECRET,
        callbackURL: `${backendUrl}/api/v1/auth/sso/facebook/callback`,
        profileFields: ["id", "emails", "name", "picture.type(large)"],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const ssoProfile: SSOProfile = {
          provider: "facebook",
          providerUserId: profile.id,
          email: profile.emails?.[0]?.value || "",
          firstName: profile.name?.givenName || "",
          lastName: profile.name?.familyName || "",
          profilePictureUrl: profile.photos?.[0]?.value,
          rawData: profile._json as Record<string, unknown>,
        };
        done(null, ssoProfile);
      }
    )
  );
}

// LinkedIn: handled manually in sso.controller.ts via OpenID Connect
// (passport-linkedin-oauth2 v2.x is broken with LinkedIn's current API)

export { passport };
