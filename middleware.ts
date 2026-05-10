import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth/session";
import { copyResponseCookies, updateSupabaseSession } from "@/utils/supabase/middleware";

const protectedPrefixes = ["/dashboard", "/reports", "/settings", "/runs", "/costs", "/testing"];

export async function middleware(request: NextRequest) {
  const supabaseResponse = await updateSupabaseSession(request);
  const { pathname } = request.nextUrl;
  const isProtectedPage = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtectedPage) return supabaseResponse;
  if (await isAuthenticatedRequest(request)) return supabaseResponse;

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return copyResponseCookies(supabaseResponse, NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron/weekly-report|api/videos/.*/summarize|api/health).*)"
  ]
};
