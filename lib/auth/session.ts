import "server-only";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db/pool";
import { newToken, tokenHash } from "./password";
import type { Profile } from "@/types/database";

export const SESSION_COOKIE = "nursing_session";
const TTL = 7 * 24 * 60 * 60;

export async function readSession(token?: string): Promise<Profile | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await getPool().query<Profile>(
    `SELECT p.* FROM app_sessions s JOIN profiles p ON p.user_id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND p.status='active'`, [tokenHash(token)]);
  return rows[0] ?? null;
}
export async function currentProfile() {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function startSession(userId: string) {
  const jar = await cookies();
  const previous = jar.get(SESSION_COOKIE)?.value;
  const token = newToken();
  await getPool().query("DELETE FROM app_sessions WHERE expires_at<now() OR token_hash=$1", [tokenHash(previous ?? "")]);
  await getPool().query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [tokenHash(token), userId]);
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TTL });
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getPool().query("DELETE FROM app_sessions WHERE token_hash=$1", [tokenHash(token)]);
  jar.delete(SESSION_COOKIE);
}
