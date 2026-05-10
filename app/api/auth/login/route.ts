import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions, createAuthToken, getDashboardPassword } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(String(formData.get("next") ?? "/dashboard"));
  const expectedPassword = getDashboardPassword();

  if (!expectedPassword) {
    return redirectToLogin(request, "missing_config", nextPath);
  }

  if (password !== expectedPassword) {
    return redirectToLogin(request, "invalid", nextPath);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), { status: 303 });
  response.cookies.set(AUTH_COOKIE_NAME, await createAuthToken(expectedPassword), authCookieOptions);
  return response;
}

function redirectToLogin(request: NextRequest, error: string, nextPath: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url, { status: 303 });
}

function safeNextPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}
