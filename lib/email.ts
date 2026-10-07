import "server-only";

import nodemailer from "nodemailer";
import { enqueueTemplateEmail, processEmailQueue } from "@/lib/email-queue";

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
  await enqueueTemplateEmail(email, "welcome", { student_name: name });
  await processEmailQueue(1);
}

export async function sendPasswordResetEmail(email: string, url: string) {
  await enqueueTemplateEmail(email, "password_reset", { reset_url: url });
  await processEmailQueue(1);
}
