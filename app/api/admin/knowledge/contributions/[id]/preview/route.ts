import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import { getContributionPreview } from "@/lib/lectures/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminProfileOrNull();
  if (!admin) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const { id } = await params;
  const { rows } = await getPool().query<{ lecture_id: string }>(
    "SELECT lecture_id FROM knowledge_contributions WHERE id=$1",
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  return NextResponse.json({ preview: await getContributionPreview(rows[0].lecture_id) });
}
