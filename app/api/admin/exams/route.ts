import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";
import {enqueueExam} from "@/lib/tutor/exam-jobs";
import {z} from "zod";

export async function GET(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get("subjectId");

    const pool = getPool();
    let sql = `
      SELECT
        e.id, e.subject_id, s.name_ar AS subject_name,
        e.title, e.exam_year, e.semester, e.exam_type, e.doctor_name,
        e.document_id, e.status, e.total_questions, e.verified_questions,
        e.needs_review_questions, e.conflict_questions, e.error_message,
        e.created_at, e.updated_at
      FROM public.exams e
      JOIN public.subjects s ON s.id = e.subject_id
    `;
    const params: unknown[] = [];

    if (subjectId) {
      params.push(subjectId);
      sql += ` WHERE e.subject_id = $1`;
    }

    sql += ` ORDER BY e.created_at DESC`;

    const { rows } = await pool.query(sql, params);
    return NextResponse.json({ exams: rows });
  } catch (err) {
    console.error("[AdminExamsAPI] GET error:", err);
    return NextResponse.json({ error: "تعذر جلب قائمة الامتحانات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminProfileOrNull();
    if (!admin) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const { examId } = await request.json();
    if (!examId) {
      return NextResponse.json({ error: "معرّف الامتحان مطلوب" }, { status: 400 });
    }

    if(!z.string().uuid().safeParse(examId).success)return NextResponse.json({error:'معرف غير صالح'},{status:400});
    const exists=(await getPool().query('select id from exams where id=$1',[examId])).rows[0];
    if(!exists)return NextResponse.json({error:'الامتحان غير موجود'},{status:404});
    await enqueueExam(examId);

    return NextResponse.json({
      success: true,
      message: "تم بدء إعادة معالجة الامتحان والتحقق من الأسئلة في الخلفية بنجاح",
    });
  } catch (err) {
    console.error("[AdminExamsAPI] POST error:", err);
    return NextResponse.json({ error: "تعذر إعادة معالجة الامتحان" }, { status: 500 });
  }
}
