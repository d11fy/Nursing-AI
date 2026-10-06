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
    const locked = await client.query("select id from app_users where id=$1 for update", [userId]);
    if (!locked.rows[0]) throw new Error("Account not found");

    await client.query("delete from app_sessions where expires_at<=now() or revoked_at is not null");
    const active = await client.query<{ device_hash: string | null }>(
      `select device_hash from app_sessions
        where user_id=$1 and expires_at>now() and revoked_at is null
        order by created_at desc limit 1`,
      [userId]
    );
    if (active.rows[0]?.device_hash && active.rows[0].device_hash !== deviceHash) {
      throw new DeviceConflictError();
    }

    // One server-side session per account. Tabs share the same HttpOnly cookie.
    await client.query("delete from app_sessions where user_id=$1", [userId]);
    await client.query(
      `insert into app_sessions(token_hash,user_id,device_hash,expires_at,created_at,last_seen_at)
       values($1,$2,$3,now()+($4 * interval '1 second'),now(),now())`,
      [tokenHash(sessionToken), userId, deviceHash, SESSION_TTL_SECONDS]
    );
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
