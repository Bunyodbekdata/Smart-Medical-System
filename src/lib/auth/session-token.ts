import crypto from "node:crypto";

export const LOCAL_SESSION_COOKIE = "medclinic_local_session";

declare global {
  var __medclinicEphemeralSecret: string | undefined;
}

function getSigningSecret(): string {
  const configured = (
    process.env.AUTH_SECRET ||
    process.env.LOCAL_AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();

  if (configured.length >= 16) {
    return configured;
  }

  const hasRemotePostgres = Boolean(
    (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim()
  );

  if (process.env.NODE_ENV === "production" && hasRemotePostgres) {
    throw new Error(
      "Xavfsizlik xatosi: Production muhitida AUTH_SECRET kamida 32 ta belgidan iborat bo'lishi shart."
    );
  }

  if (!globalThis.__medclinicEphemeralSecret) {
    globalThis.__medclinicEphemeralSecret = crypto.randomBytes(32).toString("hex");
  }
  return globalThis.__medclinicEphemeralSecret;
}

export function createSignedSessionToken(userId: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySignedSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  try {
    const expected = crypto
      .createHmac("sha256", getSigningSecret())
      .update(`${userId}.${expStr}`)
      .digest("hex");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    return userId;
  } catch {
    return null;
  }
}
