import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import type { Profile } from "@/types/database";

export async function getCurrentUser() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return { db, user };
}

/** Fetches the signed-in student's profile. Redirects to /login if there is
 * no session — proxy.ts already gates /dashboard, this is defense in depth. */
export async function requireProfile(): Promise<Profile> {
  const { db, user } = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: profile } = await db
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
  const { db, user } = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return null;
  return profile;
}
