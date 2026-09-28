import { RegisterForm } from "@/components/auth/register-form";
import { googleSignInEnabled } from "@/lib/auth/google";

export default function RegisterPage() {
  return <RegisterForm googleEnabled={googleSignInEnabled()} />;
}
