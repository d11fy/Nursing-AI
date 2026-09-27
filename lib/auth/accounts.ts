import "server-only";
import nodemailer from "nodemailer";
import { getPool, transaction } from "@/lib/db/pool";
import { hashPassword, verifyPassword, newToken, tokenHash } from "./password";
import { startSession, endSession } from "./session";
import type { RegisterInput } from "@/lib/validations/auth";

export class AccountAlreadyExistsError extends Error {
  constructor() {
    super("An account already exists for this email");
    this.name = "AccountAlreadyExistsError";
  }
}

const academicYearCodeByLegacyValue = {
  year1: "first_year",
  year2: "second_year",
  year3: "third_year",
  year4: "fourth_year",
  other: null,
} as const;

// Database-backed throttles survive restarts and work across app replicas.
async function allowAttempt(key: string, maximum: number) {
  const { rows } = await getPool().query(
    `INSERT INTO auth_attempts(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes')
     ON CONFLICT(key) DO UPDATE SET
       attempts=CASE WHEN auth_attempts.expires_at<now() THEN 1 ELSE auth_attempts.attempts+1 END,
       expires_at=CASE WHEN auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.expires_at END
     RETURNING attempts`, [tokenHash(key)]);
  return rows[0].attempts <= maximum;
}
export async function registerAccount(input: RegisterInput) {
  const email = input.email.toLowerCase();
  if (!await allowAttempt(`register:${email}`, 5) || !await allowAttempt("register:global", 100)) throw new Error("حاول مرة أخرى لاحقًا");
  const passwordHash = await hashPassword(input.password);
  const id = await transaction(async (client) => {
    const academicYearCode = academicYearCodeByLegacyValue[input.nursingYear];
    const academicYear = academicYearCode
      ? (await client.query<{ id: string }>(
          "SELECT id FROM academic_years WHERE code=$1 AND is_active=true",
          [academicYearCode]
        )).rows[0]
      : null;
    if (academicYearCode && !academicYear) {
      throw new Error(`Active academic year is missing: ${academicYearCode}`);
    }

    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO app_users(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO NOTHING RETURNING id",
      [email, passwordHash]
    );
    if (!rows[0]) throw new AccountAlreadyExistsError();
    await client.query(`INSERT INTO profiles(user_id,email,full_name,university,nursing_year,academic_year_id)
      VALUES($1,$2,$3,$4,$5,$6)`,
      [rows[0].id, email, input.fullName, input.university, input.nursingYear, academicYear?.id ?? null]);
    return rows[0].id as string;
  });
  await startSession(id);
}
export async function loginAccount(emailInput: string, password: string) {
  const email = emailInput.toLowerCase();
  if (!await allowAttempt(`login:${email}`, 10) || !await allowAttempt("login:global", 500)) return false;
  const { rows } = await getPool().query("SELECT u.id,u.password_hash,p.status FROM app_users u JOIN profiles p ON p.user_id=u.id WHERE u.email=$1", [email]);
  const user = rows[0];
  const dummy = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
  const valid = await verifyPassword(password, user?.password_hash ?? dummy);
  if (!user || !valid || user.status !== "active") return false;
  await startSession(user.id);
  await getPool().query("DELETE FROM auth_attempts WHERE key=$1", [tokenHash(`login:${email}`)]);
  return true;
}
export async function requestPasswordReset(emailInput: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.APP_URL) throw new Error("خدمة استعادة كلمة المرور غير مفعّلة؛ تواصل مع الإدارة");
  const email = emailInput.toLowerCase();
  if (!await allowAttempt(`reset:${email}`, 3) || !await allowAttempt("reset:global", 100)) return;
  const { rows } = await getPool().query("SELECT id FROM app_users WHERE email=$1", [email]);
  if (!rows[0]) return;
  const token = newToken();
  await getPool().query("DELETE FROM password_resets WHERE user_id=$1 OR expires_at<now()", [rows[0].id]);
  await getPool().query("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')", [tokenHash(token), rows[0].id]);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === "465", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  const url = new URL("/reset-password", process.env.APP_URL);
  url.searchParams.set("token", token);
  await transport.sendMail({ from: process.env.SMTP_FROM, to: email, subject: "Nursing AI — إعادة تعيين كلمة المرور", text: `رابط إعادة تعيين كلمة المرور صالح لمدة 30 دقيقة:\n${url.toString()}` });
}
export async function resetAccountPassword(token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  if (!await allowAttempt("reset-consume:global", 100)) return false;
  const passwordHash = await hashPassword(password);
  const changed = await transaction(async (client) => {
    const { rows } = await client.query("DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id", [tokenHash(token)]);
    if (!rows[0]) return false;
    await client.query("UPDATE app_users SET password_hash=$1 WHERE id=$2", [passwordHash, rows[0].user_id]);
    await client.query("DELETE FROM app_sessions WHERE user_id=$1", [rows[0].user_id]);
    await client.query("DELETE FROM password_resets WHERE user_id=$1", [rows[0].user_id]);
    return true;
  });
  if (changed) await endSession();
  return changed;
}
