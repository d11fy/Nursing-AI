// Creates one admin + 5 demo student accounts for local testing.
// Passwords are generated randomly and only ever printed to the terminal —
// never written to disk or committed to git.
//
// Usage (requires SUPABASE_SERVICE_ROLE_KEY, loaded from .env.local):
//   node --env-file=.env.local scripts/seed-users.mjs

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill .env.local first."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

const users = [
  { email: "admin@nursingai.test", fullName: "Admin", role: "admin" },
  { email: "student1@nursingai.test", fullName: "سارة أحمد", year: "year1" },
  { email: "student2@nursingai.test", fullName: "ليان محمد", year: "year2" },
  { email: "student3@nursingai.test", fullName: "يوسف علي", year: "year3" },
  { email: "student4@nursingai.test", fullName: "مريم خالد", year: "year4" },
  { email: "student5@nursingai.test", fullName: "عمر حسن", year: "year2" },
];

const created = [];

for (const u of users) {
  const password = randomPassword();

  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: u.fullName,
      university: "جامعة تجريبية",
      nursing_year: u.year ?? "other",
    },
  });

  if (error) {
    console.error(`Failed to create ${u.email}:`, error.message);
    continue;
  }

  if (u.role === "admin") {
    await supabase.from("profiles").update({ role: "admin" }).eq("user_id", data.user.id);
  }

  created.push({ email: u.email, password, role: u.role ?? "student" });
}

console.log("\nSeeded accounts (save these now — they are not stored anywhere):\n");
for (const c of created) {
  console.log(`  ${c.role.padEnd(8)} ${c.email}  /  ${c.password}`);
}
console.log("");
