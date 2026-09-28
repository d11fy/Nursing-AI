import "server-only";

import nodemailer from "nodemailer";

type EmailMessage = { to: string; subject: string; text: string; html: string };

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.APP_URL);
}

function transporter() {
  if (!smtpConfigured()) throw new Error("SMTP_HOST, SMTP_FROM and APP_URL are required");
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
}

export async function sendEmail(message: EmailMessage) {
  await transporter().sendMail({ from: process.env.SMTP_FROM, ...message });
}

export async function sendWelcomeEmail(name: string, email: string) {
  const appUrl = new URL(process.env.APP_URL!).origin;
  await sendEmail({
    to: email,
    subject: "Nursing AI — أهلًا بك في المنصة",
    text: `مرحبًا ${name}،\n\nتم إنشاء حسابك في Nursing AI بنجاح.\nيمكنك البدء من هنا: ${appUrl}/dashboard\n\nفريق Nursing AI`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>مرحبًا ${escapeHtml(name)} 👋</h2><p>تم إنشاء حسابك في Nursing AI بنجاح.</p><p><a href="${appUrl}/dashboard">ابدأ الدراسة الآن</a></p><p>فريق Nursing AI</p></div>`,
  });
}

export async function sendPasswordResetEmail(email: string, url: string) {
  await sendEmail({
    to: email,
    subject: "Nursing AI — إعادة تعيين كلمة المرور",
    text: `رابط إعادة تعيين كلمة المرور صالح لمدة 30 دقيقة:\n${url}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>إعادة تعيين كلمة المرور</h2><p>هذا الرابط صالح لمدة 30 دقيقة:</p><p><a href="${escapeHtml(url)}">إعادة تعيين كلمة المرور</a></p><p>إذا لم تطلب ذلك، تجاهل الرسالة.</p></div>`,
  });
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
