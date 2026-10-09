import React, { createContext, useContext, useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { listenForGoogleLogin } from "../services/googleAuth";
import { parseProfileSnapshot, type Profile } from "../services/profileSnapshot";
import {
  ApiError,
  apiFetch,
  clearTokens,
  getTokens,
  saveTokens,
} from "../services/api";

export type { Profile };

export interface Entitlements {
  active: boolean;
  planName: string;
  status: string;
  expiresAt: string | null;
}

export interface AiUsage {
  used: number;
  limit: number;
}

interface AuthContextType {
  profile: Profile | null;
  access: Entitlements | null;
  aiUsage: AiUsage | null;
  loading: boolean;
  /** True when the profile is the last saved copy and the server has not confirmed the session yet (offline start). */
  sessionUnverified: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    fullName: string;
    email: string;
    password: string;
    university: string;
    nursingYear: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Minimal profile copy for an offline cold start. It only lets the app show
// its shell; every data screen still needs the server and the session is
// re-verified as soon as the network returns.
const PROFILE_SNAPSHOT_KEY = "nursing_profile_snapshot";
async function saveProfileSnapshot(profile: Profile) {
  await Preferences.set({ key: PROFILE_SNAPSHOT_KEY, value: JSON.stringify(profile) }).catch(() => undefined);
}
async function clearProfileSnapshot() {
  await Preferences.remove({ key: PROFILE_SNAPSHOT_KEY }).catch(() => undefined);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<Entitlements | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUnverified, setSessionUnverified] = useState(false);

  async function checkSession() {
    try {
      const { sessionToken } = await getTokens();
      if (!sessionToken) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const res = await apiFetch("/api/auth/me");
      if (res.authenticated && res.profile) {
        setProfile(res.profile);
        setAccess(res.access || null);
        setAiUsage(res.aiUsage || null);
        setSessionUnverified(false);
        await saveProfileSnapshot(res.profile);
      } else {
        await clearTokens();
        await clearProfileSnapshot();
        setProfile(null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearTokens();
        await clearProfileSnapshot();
        setProfile(null);
      } else {
        // Offline or server unreachable: show the last known shell, marked as unverified.
        const snapshot = parseProfileSnapshot((await Preferences.get({ key: PROFILE_SNAPSHOT_KEY }).catch(() => ({ value: null }))).value);
        if (snapshot) {
          setProfile(snapshot);
          setSessionUnverified(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    () =>
      listenForGoogleLogin(refreshAuth, (message) => {
        window.dispatchEvent(
          new CustomEvent("nursing:auth-error", { detail: message }),
        );
      }),
    [],
  );

  useEffect(() => {
    // Session hydration is intentionally started once when the provider mounts.
    checkSession();

    const handleExpiredSession = () => {
      void clearProfileSnapshot();
      setSessionUnverified(false);
      setProfile(null);
      setAccess(null);
      setAiUsage(null);
      setLoading(false);
    };
    window.addEventListener("nursing:auth-expired", handleExpiredSession);
    return () =>
      window.removeEventListener("nursing:auth-expired", handleExpiredSession);
  }, []);

  async function login(email: string, password: string) {
    const { deviceToken } = await getTokens();
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceToken }),
    });

    if (res.success && res.sessionToken) {
      await saveTokens(res.sessionToken, res.deviceToken || deviceToken || "");
      if (res.profile) setProfile(res.profile);
      await refreshAuth();
    }
  }

  async function register(data: {
    fullName: string;
    email: string;
    password: string;
    university: string;
    nursingYear: string;
  }) {
    const { deviceToken } = await getTokens();
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...data, deviceToken }),
    });

    if (res.success && res.sessionToken) {
      await saveTokens(res.sessionToken, res.deviceToken || deviceToken || "");
      if (res.profile) setProfile(res.profile);
      await refreshAuth();
    }
  }

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    await clearTokens();
    await clearProfileSnapshot();
    setSessionUnverified(false);
    setProfile(null);
    setAccess(null);
    setAiUsage(null);
  }

  async function refreshAuth() {
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.authenticated && res.profile) {
        setProfile(res.profile);
        setAccess(res.access || null);
        setAiUsage(res.aiUsage || null);
        setSessionUnverified(false);
        await saveProfileSnapshot(res.profile);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearTokens();
        await clearProfileSnapshot();
        setSessionUnverified(false);
        setProfile(null);
        setAccess(null);
        setAiUsage(null);
        return;
      }
      // Keep the existing session during temporary network failures.
    }
  }

  return (
    <AuthContext.Provider
      value={{
        profile,
        access,
        aiUsage,
        loading,
        sessionUnverified,
        login,
        register,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
