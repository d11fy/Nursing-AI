import { RegisterForm } from "@/components/auth/register-form";
import { googleSignInEnabled } from "@/lib/auth/google";
import { currentProfile } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function RegisterPage() {
  const profile = await currentProfile();
  if (profile) redirect(profile.role === "admin" ? "/admin" : "/dashboard");

  return <RegisterForm googleEnabled={googleSignInEnabled()} />;
}
