import crypto from "crypto";

type SessionPayload = {
  startAtMs: number;
  lastBeatMs: number;
  nonce: string;
  player?: string;
  chainId?: number;
};

const SESSION_VERSION = 1;

const getSecret = () => {
  const secret = process.env.SESSION_HMAC_SECRET;
  if (!secret) {
    throw new Error("SESSION_HMAC_SECRET is not set");
  }
  return secret;
};

const encode = (payload: SessionPayload) =>
  Buffer.from(
    JSON.stringify({ v: SESSION_VERSION, ...payload }),
    "utf8"
  ).toString("base64url");

const decode = (token: string) => {
  const raw = Buffer.from(token, "base64url").toString("utf8");
  const parsed = JSON.parse(raw) as SessionPayload & { v: number };
  if (parsed.v !== SESSION_VERSION) {
    throw new Error("Unsupported session token");
  }
  const { v, ...payload } = parsed;
  return payload;
};

const sign = (payload: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("base64url");

export const createSessionToken = (
  payload: Omit<SessionPayload, "lastBeatMs">,
  nowMs: number
) => {
  const secret = getSecret();
  const fullPayload: SessionPayload = {
    ...payload,
    lastBeatMs: nowMs,
  };
  const encoded = encode(fullPayload);
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
};

export const refreshSessionToken = (token: string, nowMs: number) => {
  const { payload, signature } = verifySessionToken(token);
  const updated = encode({
    ...payload,
    lastBeatMs: nowMs,
  });
  const newSignature = sign(updated, getSecret());
  return `${updated}.${newSignature}`;
};

export const verifySessionToken = (token: string) => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    throw new Error("Malformed session token");
  }
  const expected = sign(payload, getSecret());
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid session token");
  }

  return {
    payload: decode(payload),
    signature,
  };
};