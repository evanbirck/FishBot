import { NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth/session";

export async function isManualRunRequestAuthorized(request: NextRequest, cronSecret: string): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  return Boolean(
    (await isAuthenticatedRequest(request)) ||
      authorization === `Bearer ${cronSecret}` ||
      headerSecret === cronSecret
  );
}
