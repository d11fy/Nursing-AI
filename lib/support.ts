import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { workerDb, withIdentity } from "@/lib/tutor/db";
import { allowAttempt } from "@/lib/auth/accounts";
import { z } from "zod";
import { enqueueTemplateEmail } from "@/lib/email-queue";
const schema=z.object({email:z.string().trim().email().max(254),subject:z.string().trim().min(3).max(120),message:z.string().trim().min(10).max(3000)});
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function createSupportTicket(input:unknown){
  const data=schema.parse(input);
  if(!await allowAttempt(`support:${data.email.toLowerCase()}`,3)||!await allowAttempt("support:global",100))throw new Error("وصلت إلى حد الطلبات؛ حاول لاحقًا");
  const token=randomBytes(24).toString("hex");
  const row=(await workerDb.query<{id:string}>("insert into support_tickets(token_hash,email,subject,message) values($1,$2,$3,$4) returning id",[hash(token),data.email.toLowerCase(),data.subject,data.message])).rows[0];
  await enqueueTemplateEmail(data.email.toLowerCase(),"support_received",{}).catch(()=>null);
  return {id:row.id,token};
}
export async function readSupportTicket(token:string){
  if(!/^[a-f0-9]{48}$/.test(token))return null;
  return (await workerDb.query("select id,subject,status,reply,created_at,updated_at from support_tickets where token_hash=$1",[hash(token)])).rows[0]??null;
}
export async function replySupportTicket(adminId:string,id:string,reply:string){
  const message=z.string().trim().min(3).max(4000).parse(reply);z.string().uuid().parse(id);
  await withIdentity(adminId,async db=>{
    const admin=(await db.query("select 1 from profiles where user_id=$1 and role='admin' and status='active'",[adminId])).rows[0];if(!admin)throw new Error("غير مصرح");
    await db.query("update support_tickets set reply=$2,status='answered',replied_by=$3,updated_at=now() where id=$1",[id,message,adminId]);
    await db.query("insert into admin_audit_logs(event_type,admin_id,metadata) values('SUPPORT_REPLIED',$1,$2::jsonb)",[adminId,JSON.stringify({ticketId:id})]);
  });
}
