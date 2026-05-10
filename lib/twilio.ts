import { createHmac, timingSafeEqual } from "node:crypto";

export function validateTwilioSignature(
  authToken: string,
  callbackUrl: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!signature) return false;
  const base = callbackUrl + Object.keys(params).sort().map((key) => `${key}${params[key]}`).join("");
  const digest = createHmac("sha1", authToken).update(base).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
