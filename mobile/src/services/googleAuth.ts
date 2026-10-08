import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { apiFetch, getTokens, saveTokens, resolveOfficialUrl } from "./api";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "./secureStorage";
const AUTH_SCHEME =
  import.meta.env.VITE_APP_VARIANT === "preview"
    ? "nursingai-preview"
    : "nursingai";
const FLOW_KEY = "nursing_google_pkce";
function randomHex() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function startGoogleLogin() {
  const verifier = randomHex(),
    state = randomHex();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const tokens = await getTokens();
  const deviceToken = tokens.deviceToken || randomHex();
  await saveTokens(tokens.sessionToken || "", deviceToken);
  await setSecureItem(
    FLOW_KEY,
    JSON.stringify({ verifier, state, expires: Date.now() + 10 * 60 * 1000 }),
  );
  const result = await apiFetch<{ url: string }>("/api/auth/mobile/start", {
    method: "POST",
    body: JSON.stringify({
      challenge,
      state,
      deviceToken,
      scheme: AUTH_SCHEME,
    }),
  });
  const url = resolveOfficialUrl(result.url);
  if (Capacitor.isNativePlatform()) await Browser.open({ url });
  else window.location.assign(url);
}
export async function consumeGoogleLink(value: string) {
  const url = new URL(value);
  if (url.protocol !== `${AUTH_SCHEME}:` || url.hostname !== "auth")
    return false;
  const raw = await getSecureItem(FLOW_KEY);
  if (!raw) throw new Error("ابدأ تسجيل الدخول من التطبيق أولًا");
  const flow = JSON.parse(raw);
  if (flow.expires < Date.now() || url.searchParams.get("state") !== flow.state)
    throw new Error("انتهت جلسة الدخول أو الرابط غير صالح");
  if (url.searchParams.has("error")) {
    await removeSecureItem(FLOW_KEY);
    const errors: Record<string, string> = {
      google_cancelled: "تم إلغاء الدخول بحساب Google",
      device_in_use: "الحساب مستخدم على جهاز آخر",
      google_config: "دخول Google غير مهيأ على الخادم",
      google_failed: "تعذر تسجيل الدخول بحساب Google",
    };
    throw new Error(
      errors[url.searchParams.get("error")!] || "تعذر تسجيل الدخول",
    );
  }
  const session = await apiFetch<{ sessionToken: string; deviceToken: string }>(
    "/api/auth/mobile/exchange",
    {
      method: "POST",
      body: JSON.stringify({
        code: url.searchParams.get("code"),
        verifier: flow.verifier,
      }),
    },
  );
  await saveTokens(session.sessionToken, session.deviceToken);
  await removeSecureItem(FLOW_KEY);
  return true;
}
export function listenForGoogleLogin(
  onSuccess: () => Promise<void>,
  onError: (message: string) => void,
) {
  if (!Capacitor.isNativePlatform()) return () => {};
  let disposed = false;
  let processing = false;
  const handle = async (url: string) => {
    if (disposed || processing || !url.startsWith(`${AUTH_SCHEME}://auth`))
      return;
    processing = true;
    try {
      if (await consumeGoogleLink(url)) {
        await Browser.close().catch(() => {});
        if (!disposed) await onSuccess();
      }
    } catch (error) {
      if (!disposed)
        onError(error instanceof Error ? error.message : "تعذر تسجيل الدخول");
    } finally {
      processing = false;
    }
  };
  const listener = App.addListener(
    "appUrlOpen",
    (event) => void handle(event.url),
  );
  void App.getLaunchUrl()
    .then((result) => {
      if (result?.url) void handle(result.url);
    })
    .catch(() => {});
  return () => {
    disposed = true;
    void listener.then((value) => value.remove());
  };
}
