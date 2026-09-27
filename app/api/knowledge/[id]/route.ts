import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminProfileOrNull } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminProfileOrNull();
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_url")
    .eq("id", id)
    .single();

  if (doc?.file_url) {
    await supabase.storage.from("knowledge-documents").remove([doc.file_url]);
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "تعذر حذف الملف" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
