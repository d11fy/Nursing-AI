import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { googleSignInEnabled } from "@/lib/auth/google";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleEnabled={googleSignInEnabled()} />
    </Suspense>
  );
}
