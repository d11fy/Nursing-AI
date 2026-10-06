import "server-only";
import { cookies } from "next/headers";
import {
  DEVICE_TTL_SECONDS,
  establishSession,
  findSessionProfile,
  renewSession,
  revokeSessionToken,
  SESSION_TTL_SECONDS,
} from "./session-store";

export const SESSION_COOKIE = "nursing_session";
export const DEVICE_COOKIE = "nursing_device";

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export function deviceCookieOptions(maxAge = DEVICE_TTL_SECONDS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export async function readSession(token?: string, deviceToken?: string) {
  return findSessionProfile(token, deviceToken);
}
export async function currentProfile() {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value, jar.get(DEVICE_COOKIE)?.value);
}
export async function startSession(userId: string) {
  const jar = await cookies();
  const issued = await establishSession(userId, jar.get(DEVICE_COOKIE)?.value);
  jar.set(DEVICE_COOKIE, issued.deviceToken, deviceCookieOptions());
  jar.set(SESSION_COOKIE, issued.sessionToken, sessionCookieOptions());
}
export async function refreshSession(token?: string, deviceToken?: string) {
  return renewSession(token, deviceToken);
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await revokeSessionToken(token);
  jar.delete(SESSION_COOKIE);
}
