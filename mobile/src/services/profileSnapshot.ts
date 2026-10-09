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

/** Validates the locally saved profile copy used for an offline start; anything unexpected is discarded. */
export function parseProfileSnapshot(value: string | null): Profile | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value);
    if (typeof data?.user_id !== "string" || typeof data?.full_name !== "string") return null;
    if (data.role !== "student" && data.role !== "admin") return null;
    if (data.status !== "active") return null;
    return {
      user_id: data.user_id, email: String(data.email ?? ""), full_name: data.full_name,
      university: String(data.university ?? ""), nursing_year: String(data.nursing_year ?? ""),
      academic_year_id: typeof data.academic_year_id === "string" ? data.academic_year_id : null,
      role: data.role, status: data.status,
    };
  } catch {
    return null;
  }
}
