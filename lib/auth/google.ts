import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { transaction } from "@/lib/db/pool";
import { startSession } from "@/lib/auth/session";
import type { NursingYear } from "@/types/database";

const FLOW_COOKIE = "nursing_google_flow";
const PENDING_COOKIE = "nursing_google_pending";
const COOKIE_TTL = 10 * 60;
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

type GoogleIdentity = { sub: string; email: string; name: string; exp: number };
type FlowState = { state: string; verifier: string; redirectTo: string };

const yearCode: Record<NursingYear, string | null> = {
  year1: "first_year", year2: "second_year", year3: "third_year", year4: "fourth_year", other: null,
};

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!clientId || !clientSecret || !appUrl) throw new Error("Google sign-in is not configured");
  return { clientId, clientSecret, appUrl: new URL(appUrl).origin };
}

export function googleSignInEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.APP_URL?.trim());
}

function safeRedirect(value: string | null | undefined) {
  return value && /^\/(?![\/\\])/.test(value) && !/[\\\r\n]/.test(value) ? value : "/dashboard";
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode<T>(value: string): T | null {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; }
  catch { return null; }
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return value;
}

function seal(value: GoogleIdentity) {
  const payload = encode(value);
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function unseal(value?: string): GoogleIdentity | null {
  const [payload, signature] = value?.split(".") ?? [];
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const identity = decode<GoogleIdentity>(payload);
  if (!identity || identity.exp < Date.now() || !identity.sub || !identity.email || !identity.name) return null;
  return identity;
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: COOKIE_TTL };
}

export async function beginGoogleSignIn(redirectTo?: string | null) {
  const { clientId, appUrl } = config();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const flow: FlowState = { state, verifier, redirectTo: safeRedirect(redirectTo) };
  (await cookies()).set(FLOW_COOKIE, encode(flow), cookieOptions());

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url;
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Google OAuth request failed (${response.status})`);
  return response.json();
}

export async function finishGoogleSignIn(code: string, returnedState: string) {
  const jar = await cookies();
  const flow = decode<FlowState>(jar.get(FLOW_COOKIE)?.value ?? "");
  jar.delete(FLOW_COOKIE);
  if (!flow || flow.state.length !== returnedState.length || !timingSafeEqual(Buffer.from(flow.state), Buffer.from(returnedState))) {
    throw new Error("Invalid Google OAuth state");
  }
  const { clientId, clientSecret, appUrl } = config();
  const token = await fetchJson(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: `${appUrl}/auth/google/callback`, grant_type: "authorization_code", code_verifier: flow.verifier,
    }),
  }) as { access_token?: string };
  if (!token.access_token) throw new Error("Google did not return an access token");
  const info = await fetchJson(USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } }) as {
    sub?: string; email?: string; email_verified?: boolean; name?: string;
  };
  if (!info.sub || !info.email || info.email_verified !== true) throw new Error("Google email is not verified");
  const identity: GoogleIdentity = {
    sub: info.sub,
    email: info.email.trim().toLowerCase(),
    name: info.name?.trim() || info.email.split("@")[0],
    exp: Date.now() + COOKIE_TTL * 1000,
  };

  const userId = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string; google_subject: string | null; status: string }>(
      `select u.id,u.google_subject,p.status from app_users u join profiles p on p.user_id=u.id
       where u.google_subject=$1 or u.email=$2 for update`, [identity.sub, identity.email]
    );
    const account = rows[0];
    if (!account) return null;
    if (account.status !== "active" || (account.google_subject && account.google_subject !== identity.sub)) throw new Error("Google account cannot be linked");
    await client.query("update app_users set google_subject=$1 where id=$2", [identity.sub, account.id]);
    return account.id;
  });
  if (userId) {
    await startSession(userId);
    return { complete: true as const, redirectTo: flow.redirectTo };
  }

  jar.set(PENDING_COOKIE, seal(identity), cookieOptions());
  return { complete: false as const, redirectTo: "/google-complete" };
}

export async function pendingGoogleIdentity() {
  return unseal((await cookies()).get(PENDING_COOKIE)?.value);
}

export async function completeGoogleRegistration(input: { university: string; nursingYear: NursingYear }) {
  const jar = await cookies();
  const identity = unseal(jar.get(PENDING_COOKIE)?.value);
  if (!identity) throw new Error("Google registration expired");
  const userId = await transaction(async (client) => {
    const existing = (await client.query<{ id: string; google_subject: string | null; status: string }>(
      `select u.id,u.google_subject,p.status from app_users u join profiles p on p.user_id=u.id
       where u.google_subject=$1 or u.email=$2 for update`, [identity.sub, identity.email]
    )).rows[0];
    if (existing) {
      if (existing.status !== "active" || (existing.google_subject && existing.google_subject !== identity.sub)) throw new Error("Google account cannot be linked");
      await client.query("update app_users set google_subject=$1 where id=$2", [identity.sub, existing.id]);
      return existing.id;
    }
    const code = yearCode[input.nursingYear];
    const academicYear = code ? (await client.query<{ id: string }>("select id from academic_years where code=$1 and is_active=true", [code])).rows[0] : null;
    if (code && !academicYear) throw new Error("Academic year is unavailable");
    const user = (await client.query<{ id: string }>(
      "insert into app_users(email,password_hash,google_subject) values($1,'oauth-only',$2) returning id",
      [identity.email, identity.sub]
    )).rows[0];
    await client.query(
      `insert into profiles(user_id,email,full_name,university,nursing_year,academic_year_id)
       values($1,$2,$3,$4,$5,$6)`,
      [user.id, identity.email, identity.name, input.university, input.nursingYear, academicYear?.id ?? null]
    );
    return user.id;
  });
  jar.delete(PENDING_COOKIE);
  await startSession(userId);
}
