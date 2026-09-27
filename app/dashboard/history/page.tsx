import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { ConversationRow } from "@/components/dashboard/conversation-row";
import { Button } from "@/components/ui/button";

export default async function HistoryPage() {
  const profile = await requireProfile();
  const db = await createClient();

  const { data: conversations } = await db
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", profile.user_id)
    .order("updated_at", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">المحادثات السابقة</h1>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link href="/dashboard/chat">
              <MessageSquarePlus className="size-4" />
              محادثة جديدة
            </Link>
          }
        />
      </div>

      {!conversations || conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-slate-400">
          لا توجد محادثات بعد
        </div>
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
