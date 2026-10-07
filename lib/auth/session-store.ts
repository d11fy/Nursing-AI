import "server-only";

import { getPool, transaction } from "@/lib/db/pool";
import { newToken, tokenHash } from "./password";
import type { Profile } from "@/types/database";

export const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;
export const DEVICE_TTL_SECONDS = 400 * 24 * 60 * 60;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export class DeviceConflictError extends Error {
  constructor() {
    super("This account is active on another device");
    this.name = "DeviceConflictError";
  }
}

function validToken(value?: string): value is string {
  return Boolean(value && TOKEN_PATTERN.test(value));
}

export async function findSessionProfile(sessionToken?: string, deviceToken?: string): Promise<Profile | null> {
  if (!validToken(sessionToken)) return null;
  const deviceHash = validToken(deviceToken) ? tokenHash(deviceToken) : null;
  const { rows } = await getPool().query<Profile>(
    `select p.*
       from app_sessions s
       join profiles p on p.user_id=s.user_id
      where s.token_hash=$1
        and s.expires_at>now()
        and s.revoked_at is null
        and p.status='active'
        and (s.device_hash is null or s.device_hash=$2)`,
    [tokenHash(sessionToken), deviceHash]
  );
  return rows[0] ?? null;
}

export async function establishSession(userId: string, presentedDeviceToken?: string) {
  const deviceToken = validToken(presentedDeviceToken) ? presentedDeviceToken : newToken();
  const deviceHash = tokenHash(deviceToken);
  const sessionToken = newToken();

  await transaction(async (client) => {
    // Serializes concurrent login attempts for this account without a global lock.
    const locked = await client.query<{ id: string; role: "student" | "admin" }>(
      "select u.id,p.role from app_users u join profiles p on p.user_id=u.id where u.id=$1 for update of u",
      [userId]
    );
    if (!locked.rows[0]) throw new Error("Account not found");
    const isAdmin = locked.rows[0].role === "admin";

    await client.query("delete from app_sessions where expires_at<=now() or revoked_at is not null");
    if (isAdmin) {
      // Rotate only this browser/device. Other administrator devices remain
      // signed in with independent, revocable server-side sessions.
      await client.query("delete from app_sessions where user_id=$1 and device_hash=$2", [userId, deviceHash]);
    } else {
      const active = await client.query<{ device_hash: string | null }>(
        `select device_hash from app_sessions
          where user_id=$1 and expires_at>now() and revoked_at is null
          order by created_at desc limit 1`,
        [userId]
      );
      if (active.rows[0]?.device_hash && active.rows[0].device_hash !== deviceHash) {
        throw new DeviceConflictError();
      }
      // Students retain the existing single-device behavior.
      await client.query("delete from app_sessions where user_id=$1", [userId]);
    }

    await client.query(
      `insert into app_sessions(token_hash,user_id,device_hash,is_admin_session,expires_at,created_at,last_seen_at)
       values($1,$2,$3,$4,now()+($5 * interval '1 second'),now(),now())`,
      [tokenHash(sessionToken), userId, deviceHash, isAdmin, SESSION_TTL_SECONDS]
    );
    if (!isAdmin) await client.query("select claim_trial_device($1,$2)", [userId, deviceHash]);
  });

  return { sessionToken, deviceToken };
}

export async function renewSession(sessionToken?: string, deviceToken?: string) {
  if (!validToken(sessionToken)) return null;
  const resolvedDeviceToken = validToken(deviceToken) ? deviceToken : newToken();
  const resolvedDeviceHash = tokenHash(resolvedDeviceToken);
  const { rows } = await getPool().query<{ device_hash: string }>(
    `update app_sessions
        set device_hash=coalesce(device_hash,$2),
            last_seen_at=now(),
            expires_at=now()+($3 * interval '1 second')
      where token_hash=$1
        and expires_at>now()
        and revoked_at is null
        and (device_hash is null or device_hash=$2)
      returning device_hash`,
    [tokenHash(sessionToken), resolvedDeviceHash, SESSION_TTL_SECONDS]
  );
  return rows[0] ? { deviceToken: resolvedDeviceToken } : null;
}

export async function revokeSessionToken(sessionToken?: string) {
  if (!validToken(sessionToken)) return;
  await getPool().query("delete from app_sessions where token_hash=$1", [tokenHash(sessionToken)]);
}

export async function revokeAllUserSessions(userId: string) {
  await getPool().query("delete from app_sessions where user_id=$1", [userId]);
}
