// GitHub signs each webhook with the secret the hook was created with: `X-Hub-Signature-256: sha256=<hmac of the body>`. A body that was not signed with it did not come from GitHub.
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

export function signatureOf(body: Buffer, secret: string): string {
  return `${PREFIX}${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function isSignedBy(secret: string, body: Buffer, signature: string | undefined): boolean {
  if (!signature?.startsWith(PREFIX)) return false;
  const expected = Buffer.from(signatureOf(body, secret));
  const given = Buffer.from(signature);

  return expected.length === given.length && timingSafeEqual(expected, given);
}
