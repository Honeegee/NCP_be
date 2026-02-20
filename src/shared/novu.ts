import { Novu } from "@novu/node";
import { env } from "../config/env";

let _novu: Novu | null = null;

export function getNovu(): Novu | null {
  if (!env.NOVU_API_KEY) return null;
  if (!_novu) {
    _novu = new Novu(env.NOVU_API_KEY);
  }
  return _novu;
}
