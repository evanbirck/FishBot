import type { NextRequest } from "next/server";

export const AUTH_COOKIE_NAME = "delta_auth";

export function getDashboardPassword(): string | null {
  return process.env.DASHBOARD_PASSWORD?.trim() || null;
}

export async function createAuthToken(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(`fishbot:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidAuthToken(token?: string | null): Promise<boolean> {
  const password = getDashboardPassword();
  if (!password || !token) return false;
  return token === (await createAuthToken(password));
}

export async function isAuthenticatedRequest(request: NextRequest): Promise<boolean> {
  return isValidAuthToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/"
};
