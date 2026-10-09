import "server-only";

import { randomUUID } from "node:crypto";
import { withIdentity } from "@/lib/tutor/db";
import { enqueueTemplateEmail } from "@/lib/email-queue";
import { verifyUploadContent } from "@/lib/validations/file-content";

const RECEIPT_KINDS = ["pdf", "jpeg", "png"] as const;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Checks size and the real file signature; returns the bytes and verified MIME type. */
export async function validateReceipt(file: File) {
  if (!file.size || file.size > MAX_RECEIPT_BYTES) throw new Error("حجم إثبات الدفع يجب ألا يتجاوز 5MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = verifyUploadContent(bytes, file.type, RECEIPT_KINDS);
  if (!check.ok) throw new Error("إثبات الدفع يجب أن يكون JPG أو PNG أو PDF صالحًا");
  return { bytes, mime: check.mime };
}

export async function createPaymentRequest(userId: string, planId: string, methodId: string, file: File) {
  const receipt = await validateReceipt(file);
  const result = await withIdentity(userId, async (db) => {
    const plan = (await db.query<{ id:string;name:string;price:number;currency:string;duration_days:number }>(
      "select id,name,price,currency,duration_days from subscription_plans where id=$1 and active=true", [planId]
    )).rows[0];
    const method = (await db.query<{ id:string;name:string;type:string;account_holder:string|null;account_number:string|null;iban:string|null;wallet_number:string|null }>(
      "select id,name,type,account_holder,account_number,iban,wallet_number from payment_methods where id=$1 and active=true", [methodId]
    )).rows[0];
    if (!plan || !method) throw new Error("الباقة أو وسيلة الدفع غير متاحة");
    const duplicate = (await db.query("select 1 from payment_requests where user_id=$1 and plan_id=$2 and status='pending' limit 1", [userId, planId])).rows[0];
    if (duplicate) throw new Error("لديك طلب دفع معلق لهذه الباقة بالفعل");
    const reference = (await db.query<{ ref: string }>("select 'PAY-'||to_char(now(),'YYYY')||'-'||lpad(nextval('payment_reference_seq')::text,5,'0') ref")).rows[0].ref;
    const path = `payments/${userId}/${randomUUID()}`;
    await db.query("insert into stored_files(path,bucket,owner_id,mime_type,content) values($1,'payment-receipts',$2,$3,$4)",
      [path, userId, receipt.mime, receipt.bytes]);
    const request = (await db.query<{ id:string;payment_reference:string }>(`insert into payment_requests(
      payment_reference,user_id,plan_id,payment_method_id,amount,currency,plan_name_snapshot,price_snapshot,
      duration_days_snapshot,payment_method_snapshot,receipt_path)
      values($1,$2,$3,$4,$5,$6,$7,$5,$8,$9,$10) returning id,payment_reference`,
      [reference,userId,plan.id,method.id,plan.price,plan.currency,plan.name,plan.duration_days,JSON.stringify(method),path])).rows[0];
    const profile = (await db.query<{ email:string;full_name:string }>("select email,full_name from profiles where user_id=$1",[userId])).rows[0];
    return { ...request, email: profile.email, variables: { student_name: profile.full_name, plan_name: plan.name,
      amount: String(plan.price), currency: plan.currency, payment_reference: reference } };
  });
  await enqueueTemplateEmail(result.email, "payment_received", result.variables);
  return result;
}

export async function reviewPayment(adminId: string, requestId: string, decision: "approved" | "rejected", reason?: string) {
  const output = await withIdentity(adminId, async (db) => {
    const payment = (await db.query<{
      id:string;status:string;user_id:string;plan_id:string|null;plan_name_snapshot:string;amount:number;currency:string;
      duration_days_snapshot:number;payment_reference:string;
    }>("select * from payment_requests where id=$1 for update", [requestId])).rows[0];
    if (!payment) throw new Error("طلب الدفع غير موجود");
    if (payment.status === decision) return { unchanged: true, payment, expiry: null as string|null };
    if (payment.status !== "pending") throw new Error("تمت مراجعة هذا الطلب سابقًا");
    const profile = (await db.query<{email:string;full_name:string}>("select email,full_name from profiles where user_id=$1",[payment.user_id])).rows[0];
    if (decision === "rejected") {
      if (!reason?.trim()) throw new Error("سبب الرفض مطلوب");
      await db.query("update payment_requests set status='rejected',rejection_reason=$2,reviewed_at=now(),reviewed_by=$3 where id=$1", [requestId, reason.trim(), adminId]);
      await db.query("insert into admin_audit_logs(event_type,admin_id,target_user_id,metadata) values('PAYMENT_REJECTED',$1,$2,$3)",
        [adminId,payment.user_id,JSON.stringify({paymentRequestId:requestId,reference:payment.payment_reference})]);
      return { unchanged:false,payment,profile,expiry:null as string|null,rejectionReason:reason.trim() };
    }
    const lastEnd = (await db.query<{ends_at:string}>(`select ends_at from user_subscriptions where user_id=$1
      and kind in ('paid','manual','adjustment') and status not in ('cancelled','revoked') and ends_at>now()
      order by ends_at desc limit 1 for update`,[payment.user_id])).rows[0]?.ends_at;
    const start = lastEnd ? new Date(lastEnd) : new Date();
    const end = new Date(start.getTime()+payment.duration_days_snapshot*86_400_000);
    const subscription = (await db.query<{id:string}>(`insert into user_subscriptions(user_id,plan_id,payment_request_id,kind,status,
      starts_at,ends_at,plan_name_snapshot,amount_paid,currency,duration_days_snapshot,created_by,approved_by,notes)
      values($1,$2,$3,'paid',$4,$5,$6,$7,$8,$9,$10,$11,$11,'دفعة يدوية معتمدة') returning id`,
      [payment.user_id,payment.plan_id,payment.id,start.getTime()>Date.now()+1000?'scheduled':'active',start.toISOString(),end.toISOString(),
       payment.plan_name_snapshot,payment.amount,payment.currency,payment.duration_days_snapshot,adminId])).rows[0];
    await db.query("update payment_requests set status='approved',reviewed_at=now(),reviewed_by=$2 where id=$1",[requestId,adminId]);
    await db.query("insert into admin_audit_logs(event_type,admin_id,target_user_id,metadata) values('PAYMENT_APPROVED',$1,$2,$3)",
      [adminId,payment.user_id,JSON.stringify({paymentRequestId:requestId,subscriptionId:subscription.id,reference:payment.payment_reference})]);
    return { unchanged:false,payment,profile,expiry:end.toISOString(),rejectionReason:null as string|null,renewed:Boolean(lastEnd) };
  });
  if (!output.unchanged && "profile" in output && output.profile) {
    await enqueueTemplateEmail(output.profile.email, decision === "approved" ? "payment_approved" : "payment_rejected", {
      student_name: output.profile.full_name, plan_name: output.payment.plan_name_snapshot, amount: String(output.payment.amount),
      currency: output.payment.currency, payment_reference: output.payment.payment_reference,
      expiry_date: output.expiry ? new Date(output.expiry).toLocaleDateString("ar-EG") : "",
      rejection_reason: output.rejectionReason ?? "",
    });
    if (decision === "approved" && "renewed" in output && output.renewed) await enqueueTemplateEmail(output.profile.email, "subscription_renewed", {
      student_name: output.profile.full_name, plan_name: output.payment.plan_name_snapshot,
      expiry_date: output.expiry ? new Date(output.expiry).toLocaleDateString("ar-EG") : "",
    });
  }
  return output;
}
