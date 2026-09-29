import { redirect } from "next/navigation";
import { getAdminProfileOrNull } from "@/lib/auth";
import { AIProvidersView } from "@/components/admin/ai-providers-view";

export const metadata = {
  title: "مزودات الذكاء الاصطناعي | Nursing AI",
  description: "إدارة وتوجيه الذكاء الاصطناعي المتعدد ومتابعة التكاليف والمزودات الاحتياطية",
};

export default async function AdminAIProvidersPage() {
  const admin = await getAdminProfileOrNull();
  if (!admin) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <AIProvidersView />
    </div>
  );
}
