// Base URL of the Python "onyx-brain" FastAPI service.
// Defaults to the local dev address, so behaviour is unchanged unless an env var is set.
// - Server code can use ONYX_BRAIN_URL.
// - Browser code needs NEXT_PUBLIC_ONYX_BRAIN_URL (inlined at build time).
export const BRAIN_URL =
  process.env.NEXT_PUBLIC_ONYX_BRAIN_URL ||
  process.env.ONYX_BRAIN_URL ||
  "http://127.0.0.1:8000";

/** Headers to include when calling the brain from Next.js server actions. */
export function brainHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(extra || {}) };
  const secret = process.env.ONYX_BRAIN_SECRET;
  if (secret) headers["X-Onyx-Key"] = secret;
  return headers;
}
