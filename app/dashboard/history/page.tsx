import Link from "next/link";
import { MessageSquarePlus, History } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { ConversationRow } from "@/components/dashboard/conversation-row";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default async function HistoryPage() {
  const profile = await requireProfile();
  const db = await createClient();

  const { data: conversations } = await db
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", profile.user_id)
    .order("updated_at", { ascending: false });

  return (
    <div className="page-container mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={History}
        eyebrow="سجل الدراسة"
        title="المحادثات السابقة"
        description="كل الشروحات والأسئلة التي حفظتها، مرتبة من الأحدث."
        actions={<Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/dashboard/chat">
              <MessageSquarePlus className="size-4" />
              محادثة جديدة
            </Link>
          }
        />}
      />

      {!conversations || conversations.length === 0 ? (
        <EmptyState icon={MessageSquarePlus} title="لا توجد محادثات بعد" description="ابدأ محادثة جديدة، وستُحفظ هنا للرجوع إليها لاحقًا." action={<Button nativeButton={false} render={<Link href="/dashboard/chat">ابدأ محادثة</Link>} />} />
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <ConversationRow key={c.id} id={c.id} title={c.title} updatedAt={c.updated_at} />
          ))}
        </div>
      )}
    </div>
  );
}
