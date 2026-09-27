import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Fetches the signed-in student's profile. Redirects to /login if there is
 * no session — proxy.ts already gates /dashboard, this is defense in depth. */
export async function requireProfile(): Promise<Profile> {
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdminProfile(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

/** API-route variant: never redirects (a redirect response would break
 * `fetch().json()` on the client) — returns null when the caller isn't an
 * authenticated admin, so the route can respond with a clean 401/403. */
export async function getAdminProfileOrNull(): Promise<Profile | null> {
  const { supabase, user } = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return null;
  return profile;
}
