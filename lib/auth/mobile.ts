import "server-only";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";
import { getPool, transaction } from "@/lib/db/pool";
import {
  currentProfile,
  SESSION_COOKIE,
  DEVICE_COOKIE,
} from "@/lib/auth/session";

export const MOBILE_FLOW_COOKIE = "nursing_mobile_oauth";
export type MobileFlow = {
  challenge: string;
  state: string;
  scheme: "nursingai" | "nursingai-preview";
  expires: number;
};
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHash("sha256").update(secret).digest();
}
export function encryptHandoff(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function decryptHandoff<T>(value: string): T {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString(),
  ) as T;
}
export async function mobileFlow() {
  const value = (await cookies()).get(MOBILE_FLOW_COOKIE)?.value;
  if (!value) return null;
  try {
    const flow = decryptHandoff<MobileFlow>(value);
    return flow.expires > Date.now() ? flow : null;
  } catch {
    return null;
  }
}
export async function createMobileHandoff() {
  const flow = await mobileFlow();
  const profile = await currentProfile();
  const jar = await cookies();
  if (!flow || !profile)
    throw new Error("انتهت جلسة تسجيل الدخول؛ حاول مجددًا");
  const sessionToken = jar.get(SESSION_COOKIE)?.value;
  const deviceToken = jar.get(DEVICE_COOKIE)?.value;
  if (!sessionToken || !deviceToken) throw new Error("Missing session");
  const code = randomBytes(32).toString("base64url");
  await transaction(async (db) => {
    await db.query("delete from mobile_auth_handoffs where expires_at<=now()");
    await db.query(
      "insert into mobile_auth_handoffs(code_hash,challenge,session_ciphertext,expires_at) values($1,$2,$3,now()+interval '2 minutes')",
      [
        createHash("sha256").update(code).digest("hex"),
        flow.challenge,
        encryptHandoff({ sessionToken, deviceToken }),
      ],
    );
  });
  jar.delete(MOBILE_FLOW_COOKIE);
  return `${flow.scheme}://auth?${new URLSearchParams({ code, state: flow.state })}`;
}
export async function exchangeMobileHandoff(code: string, verifier: string) {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  // Consume atomically, only after proof verification. A wrong verifier cannot burn the code.
  const { rows } = await getPool().query<{ session_ciphertext: string }>(
    "delete from mobile_auth_handoffs where code_hash=$1 and challenge=$2 and expires_at>now() returning session_ciphertext",
    [createHash("sha256").update(code).digest("hex"), challenge],
  );
  return rows[0]
    ? decryptHandoff<{ sessionToken: string; deviceToken: string }>(
        rows[0].session_ciphertext,
      )
    : null;
}
