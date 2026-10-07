import React, { createContext, useContext, useEffect, useState } from "react";
import { ApiError, apiFetch, clearTokens, getTokens, saveTokens } from "../services/api";

export interface Profile {
  id?: string;
  user_id: string;
  email: string;
  full_name: string;
  university: string;
  nursing_year: string;
  academic_year_id?: string | null;
  role: "student" | "admin";
  status: "active" | "suspended";
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<Entitlements | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);

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
      } else {
        await clearTokens();
        setProfile(null);
      }
    } catch {
      // If network error, don't necessarily clear tokens, might be offline
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Session hydration is intentionally started once when the provider mounts.
    checkSession();

    const handleExpiredSession = () => {
      setProfile(null);
      setAccess(null);
      setAiUsage(null);
      setLoading(false);
    };
    window.addEventListener("nursing:auth-expired", handleExpiredSession);
    return () => window.removeEventListener("nursing:auth-expired", handleExpiredSession);
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
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearTokens();
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
