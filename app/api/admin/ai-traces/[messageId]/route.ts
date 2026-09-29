import { NextResponse } from "next/server";
import { getAdminProfileOrNull } from "@/lib/auth";
import { getPool } from "@/lib/db/pool";

export async function GET(_request:Request,{params}:{params:Promise<{messageId:string}>}){
  const admin=await getAdminProfileOrNull();
  if(!admin)return NextResponse.json({error:"غير مصرح"},{status:403});
  const {messageId}=await params;
  const result=await getPool().query(
    `select resolved_query,detected_subject,active_attachment_id,attachment_ids,retrieved_sources_json,
      reranked_sources_json,evidence_coverage,selected_provider,selected_model,fallback_used,
      final_source_ids_json,refusal_reason,diagnostics_json,created_at
     from message_ai_traces where message_id=$1 limit 1`,[messageId]);
  if(!result.rows[0])return NextResponse.json({error:"لا يوجد تتبع لهذه الرسالة"},{status:404});
  return NextResponse.json(result.rows[0],{headers:{"Cache-Control":"no-store"}});
}
