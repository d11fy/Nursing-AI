import { createClient } from "@/lib/db/server";
import { identityDb } from "@/lib/tutor/db";
import { z } from "zod";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const db=await createClient(),user=db.actor;
  if(!user)return Response.json({error:"يجب تسجيل الدخول"},{status:401});
  const id=z.string().uuid().safeParse((await params).id);if(!id.success)return Response.json({error:"معرّف غير صالح"},{status:400});
  const row=(await identityDb(user.user_id).query<{mime_type:string;content:Buffer;payment_reference:string}>(`select f.mime_type,f.content,r.payment_reference from payment_requests r
    join stored_files f on f.path=r.receipt_path and f.bucket='payment-receipts' where r.id=$1`,[id.data])).rows[0];
  if(!row)return Response.json({error:"الإيصال غير موجود"},{status:404});
  return new Response(new Uint8Array(row.content),{headers:{"Content-Type":row.mime_type,"Content-Disposition":`inline; filename="${row.payment_reference}.${row.mime_type==='application/pdf'?'pdf':'jpg'}"`,"Cache-Control":'private, no-store'}});
}
