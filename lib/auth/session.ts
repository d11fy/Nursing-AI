import "server-only";
import { cookies, headers } from "next/headers";
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

export async function readSession(token?: string, deviceToken?: string, allowPendingMfa=false) {
  return findSessionProfile(token, deviceToken, allowPendingMfa);
}

export async function currentProfile(allowPendingMfa=false) {
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value;
  const deviceToken = jar.get(DEVICE_COOKIE)?.value;
  if (sessionToken) {
    return readSession(sessionToken, deviceToken, allowPendingMfa);
  }
  try {
    const head = await headers();
    const authHeader = head.get("authorization");
    const deviceHeader = head.get("x-device-token");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const bearerToken = authHeader.slice(7).trim();
      return readSession(bearerToken, deviceHeader ?? undefined, allowPendingMfa);
    }
  } catch {}
  return null;
}

export async function startSession(userId: string, customDeviceToken?: string) {
  const jar = await cookies();
  const presentedDevice = customDeviceToken || jar.get(DEVICE_COOKIE)?.value;
  const issued = await establishSession(userId, presentedDevice);
  jar.set(DEVICE_COOKIE, issued.deviceToken, deviceCookieOptions());
  jar.set(SESSION_COOKIE, issued.sessionToken, sessionCookieOptions());
  return issued;
}

export async function refreshSession(token?: string, deviceToken?: string) {
  return renewSession(token, deviceToken);
}

export async function endSession(customSessionToken?: string) {
  const jar = await cookies();
  const token = customSessionToken || jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeSessionToken(token);
  }
  jar.delete(SESSION_COOKIE);
}
