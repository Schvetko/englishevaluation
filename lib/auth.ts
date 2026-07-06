import { createHash } from "crypto";

export const ADMIN_COOKIE = "admin_auth";

export function adminCookieValue(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash("sha256")
    .update(`english-assessment:${password}`)
    .digest("hex");
}

export function isValidAdminCookie(value: string | undefined): boolean {
  const expected = adminCookieValue();
  return Boolean(expected && value && value === expected);
}
