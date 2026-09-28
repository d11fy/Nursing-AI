import { redirect } from "next/navigation";
import { GoogleCompleteForm } from "@/components/auth/google-complete-form";
import { pendingGoogleIdentity } from "@/lib/auth/google";

export default async function GoogleCompletePage() {
  const identity = await pendingGoogleIdentity();
  if (!identity) redirect("/login?error=google_expired");
  return <GoogleCompleteForm name={identity.name} email={identity.email} />;
}
