import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string = ""): string {
  return process.env[name] || fallback;
}

export const env = {
  // Server
  PORT: parseInt(optionalEnv("PORT", "4000"), 10),
  NODE_ENV: optionalEnv("NODE_ENV", "development"),

  // Supabase
  SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),

  // JWT
  JWT_SECRET: requireEnv("NEXTAUTH_SECRET"),
  JWT_ACCESS_EXPIRY: optionalEnv("JWT_ACCESS_EXPIRY", "24h"),
  JWT_REFRESH_EXPIRY: optionalEnv("JWT_REFRESH_EXPIRY", "7d"),

  // Email (optional)
  RESEND_API_KEY: optionalEnv("RESEND_API_KEY"),
  RESEND_FROM_EMAIL: optionalEnv("RESEND_FROM_EMAIL", "onboarding@resend.dev"),

  // AI (optional)
  GOOGLE_AI_API_KEY: optionalEnv("GOOGLE_AI_API_KEY"),
  OPENAI_API_KEY: optionalEnv("OPENAI_API_KEY"),

  // Novu (optional)
  NOVU_API_KEY: optionalEnv("NOVU_API_KEY"),

  // CORS
  CORS_ORIGIN: optionalEnv("CORS_ORIGIN", "http://localhost:3000"),

  // OAuth / SSO (optional)
  GOOGLE_CLIENT_ID: optionalEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optionalEnv("GOOGLE_CLIENT_SECRET"),
  LINKEDIN_CLIENT_ID: optionalEnv("LINKEDIN_CLIENT_ID"),
  LINKEDIN_CLIENT_SECRET: optionalEnv("LINKEDIN_CLIENT_SECRET"),
  FACEBOOK_CLIENT_ID: optionalEnv("FACEBOOK_CLIENT_ID"),
  FACEBOOK_CLIENT_SECRET: optionalEnv("FACEBOOK_CLIENT_SECRET"),
  FRONTEND_URL: optionalEnv("FRONTEND_URL", "http://localhost:3000"),
} as const;
