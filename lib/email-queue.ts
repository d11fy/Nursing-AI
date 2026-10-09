import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { workerDb, withIdentity } from "@/lib/tutor/db";

function escapeHtml(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
function render(template: string, variables: Record<string,string>, html=false) {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match,key:string) => html ? escapeHtml(variables[key] ?? "") : variables[key] ?? "");
}

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

export function encryptSmtpPassword(password: string) {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv),encrypted=Buffer.concat([cipher.update(password,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64"),cipher.getAuthTag().toString("base64"),encrypted.toString("base64")].join(".");
}

function decryptSmtpPassword(value: string) {
  const [version,iv,tag,data]=value.split(".");
  if(version!=="v1"||!iv||!tag||!data) throw new Error("Invalid encrypted SMTP password");
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(data,"base64")),decipher.final()]).toString("utf8");
}

export async function enqueueTemplateEmail(recipient:string,templateKey:string,variables:Record<string,string>) {
  const template=(await workerDb.query<{subject:string;html_body:string;text_body:string}>(
    "select subject,html_body,text_body from email_templates where template_key=$1 and active=true",[templateKey])).rows[0];
  if(!template) return null;
  return (await workerDb.query<{id:string}>(`insert into email_logs(recipient,template_key,subject_snapshot,html_snapshot,text_snapshot)
    values($1,$2,$3,$4,$5) returning id`,[recipient,templateKey,render(template.subject,variables),render(template.html_body,variables,true),render(template.text_body,variables)])).rows[0]?.id??null;
}

type SmtpTransport = { transport: Pick<ReturnType<typeof nodemailer.createTransport>, "sendMail">; from: string; secrets: string[] };

async function smtpTransport(): Promise<SmtpTransport> {
  const row=(await workerDb.query<{host:string|null;port:number;username:string|null;password_ciphertext:string|null;encryption:string;from_name:string;from_email:string|null}>("select * from email_settings where singleton=true")).rows[0];
  if(row?.host&&row.from_email){
    const pass=row.password_ciphertext?decryptSmtpPassword(row.password_ciphertext):undefined;
    return { transport:nodemailer.createTransport({connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,host:row.host,port:row.port,secure:row.encryption==='tls',requireTLS:row.encryption==='starttls',
      auth:row.username?{user:row.username,pass}:undefined}),from:`${row.from_name} <${row.from_email}>`,secrets:[pass,row.username].filter((v):v is string=>Boolean(v)) };
  }
  if(process.env.SMTP_HOST&&process.env.SMTP_FROM) return {transport:nodemailer.createTransport({connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',
    auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined}),from:process.env.SMTP_FROM,
    secrets:[process.env.SMTP_PASSWORD,process.env.SMTP_USER].filter((v):v is string=>Boolean(v))};
  throw new Error("إعدادات SMTP غير مكتملة");
}

/** A claimed message whose worker dies becomes claimable again after this lease. */
export const EMAIL_LEASE_SECONDS = 120;
/** Delivery attempts (including attempts lost to a crash) before a message stays failed. */
export const EMAIL_MAX_ATTEMPTS = 6;

/** 1, 2, 4, 8... minutes between attempts, capped at six hours. */
export function emailRetryDelaySeconds(attempt: number) {
  return Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempt - 1));
}

/** Error text safe to store and show to admins: no credentials, bounded length. */
export function safeEmailError(error: unknown, secrets: string[] = []) {
  let message = error instanceof Error ? error.message : "Unknown SMTP error";
  for (const secret of secrets) if (secret.length >= 3) message = message.split(secret).join("[redacted]");
  return message.replace(/(pass(word)?|auth|token)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, 500);
}

type ClaimedEmail = { id: string; claim_token: string; retry_count: number; recipient: string; subject_snapshot: string; html_snapshot: string; text_snapshot: string };

/**
 * Lease-based delivery. Claiming increments the attempt counter and stamps a
 * fresh claim_token; only the holder of that token can record the outcome, so a
 * worker whose lease expired cannot overwrite the result of the worker that
 * reclaimed the message. A stable Message-ID lets mail servers drop a
 * duplicate if a crash happens after SMTP accepted the message.
 */
export async function processEmailQueue(limit=10, deps: { transport?: () => Promise<SmtpTransport> } = {}) {
  const total={processed:0,sent:0,failed:0};
  // Claim just before delivery; queued items cannot lose their lease while waiting for earlier SMTP calls.
  for(let i=0;i<Math.min(100,Math.max(0,limit));i++) {
    const result=await processOneEmail(deps);
    total.processed+=result.processed;total.sent+=result.sent;total.failed+=result.failed;
    if(!result.processed) break;
  }
  return total;
}
async function processOneEmail(deps: { transport?: () => Promise<SmtpTransport> }) {
  const limit=1;
  await workerDb.query(`update email_logs set status='failed',claim_token=null,lease_expires_at=null,next_retry_at=null,
    last_error='Delivery worker stopped on the final attempt; administrator review required',updated_at=now()
    where status='sending' and retry_count >= $1 and coalesce(lease_expires_at,updated_at+interval '2 minutes')<now()`, [EMAIL_MAX_ATTEMPTS]);
  const jobs=(await workerDb.query<ClaimedEmail>(`update email_logs set status='sending',claim_token=gen_random_uuid(),claimed_at=now(),
      lease_expires_at=now()+($2*interval '1 second'),last_attempt_at=now(),retry_count=retry_count+1,updated_at=now()
    where id in(select id from email_logs
      where retry_count<$3 and scheduled_at<=now() and (
        (status in('pending','failed') and coalesce(next_retry_at,scheduled_at)<=now())
        or (status='sending' and coalesce(lease_expires_at,updated_at+($2*interval '1 second'))<now()))
      order by created_at limit $1 for update skip locked)
    returning id,claim_token,retry_count,recipient,subject_snapshot,html_snapshot,text_snapshot`,[limit,EMAIL_LEASE_SECONDS,EMAIL_MAX_ATTEMPTS])).rows;
  if(!jobs.length)return {processed:0,sent:0,failed:0};
  const fail=(job:ClaimedEmail,message:string)=>workerDb.query(`update email_logs set status='failed',last_error=$3,lease_expires_at=null,
      next_retry_at=case when retry_count<$4 then now()+($5*interval '1 second') else null end,updated_at=now()
    where id=$1 and claim_token=$2`,[job.id,job.claim_token,message,EMAIL_MAX_ATTEMPTS,emailRetryDelaySeconds(job.retry_count)]);
  let smtp: SmtpTransport;
  try { smtp=await (deps.transport ?? smtpTransport)(); }
  catch(error){
    // Configuration errors release every claim for a later retry instead of leaving them in "sending".
    for(const job of jobs)await fail(job,safeEmailError(error));
    return {processed:jobs.length,sent:0,failed:jobs.length};
  }
  let sent=0,failed=0;
  for(const job of jobs){try{await smtp.transport.sendMail({from:smtp.from,to:job.recipient,subject:job.subject_snapshot,html:job.html_snapshot,text:job.text_snapshot,
      messageId:`<${job.id}@nursing-ai.mail>`});
    await workerDb.query("update email_logs set status='sent',sent_at=now(),last_error=null,lease_expires_at=null,next_retry_at=null,updated_at=now() where id=$1 and claim_token=$2",[job.id,job.claim_token]);sent++;
  }catch(error){failed++;await fail(job,safeEmailError(error,smtp.secrets));}}
  return {processed:jobs.length,sent,failed};
}

/** Admin "retry now": a fresh round of attempts for a failed or stuck message. */
export async function requeueEmail(adminId:string,id:string){
  await withIdentity(adminId,async db=>{
    await db.query(`update email_logs set status='pending',retry_count=0,next_retry_at=null,lease_expires_at=null,claim_token=null,
      scheduled_at=now(),last_error=null,updated_at=now() where id=$1 and status<>'sent'`,[id]);
    await db.query("insert into admin_audit_logs(event_type,admin_id,metadata) values('EMAIL_REQUEUED',$1,$2::jsonb)",[adminId,JSON.stringify({emailId:id})]);
  });
}

export async function updateSmtpSettings(adminId:string,input:{host:string;port:number;username?:string;password?:string;encryption:string;fromName:string;fromEmail:string}) {
  await withIdentity(adminId,async db=>{
    const password=input.password?encryptSmtpPassword(input.password):null;
    await db.query(`update email_settings set host=$1,port=$2,username=$3,password_ciphertext=coalesce($4,password_ciphertext),encryption=$5,from_name=$6,from_email=$7,updated_by=$8,updated_at=now() where singleton=true`,
      [input.host,input.port,input.username||null,password,input.encryption,input.fromName,input.fromEmail,adminId]);
    await db.query("insert into admin_audit_logs(event_type,admin_id,metadata) values('SMTP_UPDATED',$1,$2)",[adminId,JSON.stringify({host:input.host,port:input.port,encryption:input.encryption,fromEmail:input.fromEmail})]);
  });
}

export async function sendSmtpTest(recipient:string) {
  const {transport,from}=await smtpTransport();
  await transport.sendMail({from,to:recipient,subject:"Nursing AI — اختبار SMTP",text:"تم إعداد البريد الإلكتروني بنجاح.",html:'<div dir="rtl"><h2>تم إعداد البريد بنجاح ✅</h2></div>'});
}
