import { Resend } from "resend";
import { env } from "../config/env";

let _resend: Resend | null = null;

export function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

export function getFromEmail(): string {
  return env.RESEND_FROM_EMAIL;
}
