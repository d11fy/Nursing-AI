import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/auth/session";
import { mfaEnabled } from "@/lib/auth/mfa";
import { SecurityForm } from "@/components/auth/security-form";
export const metadata={title:"حماية الحساب",robots:{index:false,follow:false}};
export default async function Page(){const profile=await currentProfile(true);if(!profile)redirect("/login");if(profile.role!=="admin")redirect("/dashboard");return <SecurityForm enabled={await mfaEnabled(profile.user_id)} verified={Boolean(await currentProfile())} />;}
