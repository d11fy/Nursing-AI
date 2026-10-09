import "server-only";

import { enqueueTemplateEmail, processEmailQueue } from "@/lib/email-queue";

export async function sendWelcomeEmail(name: string, email: string) {
  await enqueueTemplateEmail(email, "welcome", { student_name: name });
  await processEmailQueue(1);
}

export async function sendPasswordResetEmail(email: string, url: string) {
  await enqueueTemplateEmail(email, "password_reset", { reset_url: url });
  await processEmailQueue(1);
}
