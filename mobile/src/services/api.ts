import { Preferences } from "@capacitor/preferences";
import { getSecureItem, setSecureItem, removeSecureItem } from "./secureStorage";

export const DEFAULT_SERVER_URL = "https://nursing.alisohail.tech";

const KEY_SESSION_TOKEN = "nursing_mobile_session_token";
const KEY_DEVICE_TOKEN = "nursing_mobile_device_token";

let cachedSessionToken: string | null = null;
let cachedDeviceToken: string | null = null;

export async function getServerUrl(): Promise<string> {
  return import.meta.env.DEV ? "" : DEFAULT_SERVER_URL;
}

export function resolveOfficialUrl(value: string): string {
  const base = import.meta.env.DEV && typeof window !== "undefined" ? window.location.origin : DEFAULT_SERVER_URL;
  const resolved = new URL(value, base);
  if (!import.meta.env.DEV && resolved.origin !== new URL(DEFAULT_SERVER_URL).origin) {
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

export async function getTokens(): Promise<{ sessionToken: string | null; deviceToken: string | null }> {
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

export async function saveTokens(sessionToken: string, deviceToken: string): Promise<void> {
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
  options: RequestInit = {}
): Promise<T> {
  const { sessionToken, deviceToken } = await getTokens();
  const url = await buildApiUrl(endpoint);

  const headers = new Headers(options.headers || {});
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
    const errorMsg = data?.error || (typeof data === "string" ? data : `خطأ (${res.status})`);
    throw new ApiError(errorMsg, res.status, data);
  }

  return data as T;
}

export async function apiUpload<T = any>(endpoint: string, formData: FormData): Promise<T> {
  const { sessionToken, deviceToken } = await getTokens();
  const url = await buildApiUrl(endpoint);

  const headers = new Headers();
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  if (deviceToken) headers.set("X-Device-Token", deviceToken);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) await expireRejectedSession(Boolean(sessionToken));
    throw new ApiError(data?.error || `خطأ في الرفع (${res.status})`, res.status, data);
  }
  return data as T;
}

export async function apiStream(
  endpoint: string,
  body: any,
  callbacks: {
    onConversationId?: (id: string) => void;
    onChunk: (chunk: string) => void;
    onComplete?: (id: string | null) => void;
    onError?: (err: Error) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  const { sessionToken, deviceToken } = await getTokens();
  const url = await buildApiUrl(endpoint);

  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  });
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  if (deviceToken) headers.set("X-Device-Token", deviceToken);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) await expireRejectedSession(Boolean(sessionToken));
      throw new Error(data.error || "تعذر إكمال المحادثة، جرب ثانية.");
    }

    const conversationId = res.headers.get("X-Conversation-Id");
    if (conversationId && callbacks.onConversationId) {
      callbacks.onConversationId(conversationId);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("تعذر قراءة الاستجابة");

    const decoder = new TextDecoder();
    const isSse = res.headers.get("Content-Type")?.includes("text/event-stream");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (!isSse) {
        callbacks.onChunk(text);
      } else {
        buffer += text;
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const kind = event.match(/^event: (.+)$/m)?.[1];
          const dataMatch = event.match(/^data: (.+)$/m)?.[1];
          if (!dataMatch) continue;
          try {
            const payload = JSON.parse(dataMatch);
            if (kind === "delta" && payload.text) {
              callbacks.onChunk(payload.text);
            }
          } catch {}
        }
      }
    }

    if (callbacks.onComplete) {
      callbacks.onComplete(conversationId);
    }
  } catch (err: any) {
    if (err.name !== "AbortError" && callbacks.onError) {
      callbacks.onError(err);
    }
  }
}
