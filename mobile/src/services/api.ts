import { getInstalledVersion } from "./installedVersion";
import type { ChatTransport } from "../../../lib/chat/turn";
import type { GenerationSnapshot } from "../../../lib/chat/recovery";
import { Preferences } from "@capacitor/preferences";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "./secureStorage";

export const DEFAULT_SERVER_URL = "https://nursing.alisohail.tech";

const KEY_SESSION_TOKEN = "nursing_mobile_session_token";
const KEY_DEVICE_TOKEN = "nursing_mobile_device_token";

let cachedSessionToken: string | null = null;
let cachedDeviceToken: string | null = null;

export async function getServerUrl(): Promise<string> {
  return import.meta.env.DEV ? "" : DEFAULT_SERVER_URL;
}

export function resolveOfficialUrl(value: string): string {
  const base =
    import.meta.env.DEV && typeof window !== "undefined"
      ? window.location.origin
      : DEFAULT_SERVER_URL;
  const resolved = new URL(value, base);
  if (
    !import.meta.env.DEV &&
    resolved.origin !== new URL(DEFAULT_SERVER_URL).origin
  ) {
    throw new Error("External URL is not allowed");
  }
  return resolved.toString();
}

function requireApiPath(endpoint: string): string {
  if (!endpoint.startsWith("/api/")) {
    throw new Error("API endpoint must be a local /api/ path");
  }
  return endpoint;
}

async function buildApiUrl(endpoint: string): Promise<string> {
  const serverUrl = await getServerUrl();
  return `${serverUrl}${requireApiPath(endpoint)}`;
}

export async function getTokens(): Promise<{
  sessionToken: string | null;
  deviceToken: string | null;
}> {
  if (cachedSessionToken !== null && cachedDeviceToken !== null) {
    return { sessionToken: cachedSessionToken, deviceToken: cachedDeviceToken };
  }
  try {
    const [sToken, d] = await Promise.all([
      getSecureItem(KEY_SESSION_TOKEN),
      Preferences.get({ key: KEY_DEVICE_TOKEN }),
    ]);
    cachedSessionToken = sToken;
    cachedDeviceToken = d.value;
  } catch {
    cachedSessionToken = await getSecureItem(KEY_SESSION_TOKEN);
    cachedDeviceToken = localStorage.getItem(KEY_DEVICE_TOKEN);
  }
  return { sessionToken: cachedSessionToken, deviceToken: cachedDeviceToken };
}

export async function saveTokens(
  sessionToken: string,
  deviceToken: string,
): Promise<void> {
  cachedSessionToken = sessionToken;
  cachedDeviceToken = deviceToken;
  try {
    await Promise.all([
      setSecureItem(KEY_SESSION_TOKEN, sessionToken),
      Preferences.set({ key: KEY_DEVICE_TOKEN, value: deviceToken }),
    ]);
  } catch {
    await setSecureItem(KEY_SESSION_TOKEN, sessionToken);
    localStorage.setItem(KEY_DEVICE_TOKEN, deviceToken);
  }
}

export async function clearTokens(): Promise<void> {
  cachedSessionToken = null;
  try {
    await removeSecureItem(KEY_SESSION_TOKEN);
  } catch {}
}

async function expireRejectedSession(hadSession: boolean): Promise<void> {
  if (!hadSession) return;
  await clearTokens();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("nursing:auth-expired"));
  }
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const { sessionToken, deviceToken } = await getTokens();
  const url = await buildApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
  headers.set("X-App-Version-Code",String((await getInstalledVersion()).code));
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }
  if (deviceToken) {
    headers.set("X-Device-Token", deviceToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "omit",
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  let data: any = null;
  if (isJson) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  if (!res.ok) {
    if (res.status === 401) await expireRejectedSession(Boolean(sessionToken));
    const errorMsg =
      data?.error || (typeof data === "string" ? data : `خطأ (${res.status})`);
    throw new ApiError(errorMsg, res.status, data);
  }

  return data as T;
}

export async function apiUpload<T = any>(
  endpoint: string,
  formData: FormData,
  signal?: AbortSignal,
): Promise<T> {
  const { sessionToken, deviceToken } = await getTokens();
  const url = await buildApiUrl(endpoint);

  const headers = new Headers();
  headers.set("X-App-Version-Code",String((await getInstalledVersion()).code));
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  if (deviceToken) headers.set("X-Device-Token", deviceToken);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
    signal,
    credentials: "omit",
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) await expireRejectedSession(Boolean(sessionToken));
    throw new ApiError(
      data?.error || `خطأ في الرفع (${res.status})`,
      res.status,
      data,
    );
  }
  return data as T;
}

async function authHeaders(extra: Record<string, string> = {}) {
  const { sessionToken, deviceToken } = await getTokens();
  const headers = new Headers({ ...extra, "X-App-Version-Code": String((await getInstalledVersion()).code) });
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  if (deviceToken) headers.set("X-Device-Token", deviceToken);
  return { headers, sessionToken };
}

/**
 * Chat transport for lib/chat/turn.ts. Every question carries a request id (also sent as Idempotency-Key):
 * if the connection drops, `status` asks the server what happened and re-sending is safe.
 */
export const chatTransport: ChatTransport = {
  async start(body, signal) {
    const { headers, sessionToken } = await authHeaders({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Idempotency-Key": String(body.requestId),
    });
    const res = await fetch(await buildApiUrl("/api/chat"), { method: "POST", headers, body: JSON.stringify(body), signal });
    if (res.status === 401) await expireRejectedSession(Boolean(sessionToken));
    return res;
  },
  async status(requestId, signal) {
    const { headers, sessionToken } = await authHeaders();
    const res = await fetch(await buildApiUrl(`/api/chat/generations/${requestId}`), { headers, signal, credentials: "omit" });
    if (res.status === 401) await expireRejectedSession(Boolean(sessionToken));
    const data = await res.json().catch(() => null);
    if (res.status === 404 && data?.status === "not_found") return { status: "not_found" };
    if (!res.ok || !data) throw new ApiError(data?.error || `خطأ (${res.status})`, res.status, data);
    return data as GenerationSnapshot;
  },
  async cancel(requestId) {
    await apiFetch(`/api/chat/generations/${requestId}`, { method: "DELETE" }).catch(() => undefined);
  },
};
