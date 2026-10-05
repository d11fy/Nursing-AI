import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { getLibraryStudyPackWorkspace } from "@/features/study-pack/services/study-pack-service";
import { StudyPackWorkspace } from "@/features/study-pack/components/study-pack-workspace";

export default async function LibraryStudyPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const [data, settings] = await (async () => {
    try {
      return await Promise.all([
        getLibraryStudyPackWorkspace(id, profile.user_id),
        getSettings(await createClient()),
      ]);
    } catch {
      notFound();
    }
  })();
  return (
    <div className="page-container mx-auto max-w-4xl space-y-6">
      <Link href="/dashboard/chat" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" /> العودة إلى المساعد الدراسي
      </Link>
      <StudyPackWorkspace data={data} maxImageSizeMb={settings.maxImageSizeMb} />
    </div>
  );
}
