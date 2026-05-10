import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const formData = await request.formData();
  const payload = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value : value.name])
  );

  const signature = request.headers.get("x-twilio-signature");
  if (signature && env.TWILIO_STATUS_CALLBACK_URL) {
    const valid = validateTwilioSignature(env.TWILIO_AUTH_TOKEN, env.TWILIO_STATUS_CALLBACK_URL, payload, signature);
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Invalid Twilio signature" }, { status: 403 });
    }
  }

  const messageSid = payload.MessageSid ?? payload.SmsSid;
  if (!messageSid) {
    return NextResponse.json({ ok: false, error: "Missing MessageSid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const status = payload.MessageStatus ?? payload.SmsStatus ?? "unknown";
  const deliveredAt = status === "delivered" ? new Date().toISOString() : null;

  const result = await supabase
    .from("sms_deliveries")
    .update({
      status,
      num_segments: Number(payload.NumSegments ?? 0),
      price: payload.Price ? Number(payload.Price) : null,
      price_unit: payload.PriceUnit ?? null,
      error_code: payload.ErrorCode ?? null,
      error_message: payload.ErrorMessage ?? null,
      delivered_at: deliveredAt,
      callback_payload: payload as Json
    })
    .eq("provider_message_sid", messageSid)
    .select("id")
    .maybeSingle();

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: Boolean(result.data) });
}

function validateTwilioSignature(
  authToken: string,
  callbackUrl: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const base = callbackUrl + Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  const digest = createHmac("sha1", authToken).update(base).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
