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

async function smtpTransport() {
  const row=(await workerDb.query<{host:string|null;port:number;username:string|null;password_ciphertext:string|null;encryption:string;from_name:string;from_email:string|null}>("select * from email_settings where singleton=true")).rows[0];
  if(row?.host&&row.from_email) return { transport:nodemailer.createTransport({host:row.host,port:row.port,secure:row.encryption==='tls',requireTLS:row.encryption==='starttls',
    auth:row.username?{user:row.username,pass:row.password_ciphertext?decryptSmtpPassword(row.password_ciphertext):undefined}:undefined}),from:`${row.from_name} <${row.from_email}>` };
  if(process.env.SMTP_HOST&&process.env.SMTP_FROM) return {transport:nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',
    auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined}),from:process.env.SMTP_FROM};
  throw new Error("إعدادات SMTP غير مكتملة");
}

export async function processEmailQueue(limit=10) {
  const jobs=(await workerDb.query<{id:string;recipient:string;subject_snapshot:string;html_snapshot:string;text_snapshot:string}>(`update email_logs set status='sending',updated_at=now()
    where id in(select id from email_logs where status in('pending','failed') and retry_count<5 and scheduled_at<=now() order by created_at limit $1 for update skip locked)
    returning id,recipient,subject_snapshot,html_snapshot,text_snapshot`,[limit])).rows;
  if(!jobs.length)return {processed:0,sent:0};
  const {transport,from}=await smtpTransport(); let sent=0;
  for(const job of jobs){try{await transport.sendMail({from,to:job.recipient,subject:job.subject_snapshot,html:job.html_snapshot,text:job.text_snapshot});
    await workerDb.query("update email_logs set status='sent',sent_at=now(),last_error=null where id=$1",[job.id]);sent++;
  }catch(error){await workerDb.query("update email_logs set status='failed',retry_count=retry_count+1,last_error=$2 where id=$1",[job.id,error instanceof Error?error.message.slice(0,500):'Unknown SMTP error']);}}
  return {processed:jobs.length,sent};
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
