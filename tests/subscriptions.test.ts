import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { consumeUsage, getStudentEntitlements } from "../lib/subscriptions/service";
import { createPaymentRequest, reviewPayment } from "../lib/subscriptions/payments";
import { identityDb } from "../lib/tutor/db";
import { serializedPool } from "./helpers/serialized-pool";

const db=new PGlite({extensions:{vector}});
const userId="91000000-0000-4000-8000-000000000001",strangerId="91000000-0000-4000-8000-000000000002",adminId="91000000-0000-4000-8000-000000000003";
const query=async(sql:string,values?:unknown[])=>{if(!values&&(sql.includes(";")||sql.includes("--"))){await db.exec(sql);return {rows:[]};}return db.query(sql,values);};
let planId:string,methodId:string;

before(async()=>{process.env.DATABASE_URL="postgresql://subscriptions-test";process.env.AUTH_SECRET="subscription-test-secret-".repeat(3);const pool=serializedPool(db);Object.assign(globalThis,{nursingPool:{query:pool.query,connect:pool.connect}});await migrate({query});
  for(const [id,role] of [[userId,"student"],[strangerId,"student"],[adminId,"admin"]] as const){await db.query("insert into app_users(id,email,password_hash) values($1,$2,'x')",[id,`${id}@example.test`]);await db.query("insert into profiles(user_id,email,full_name,role) values($1,$2,$3,$4)",[id,`${id}@example.test`,id===userId?"طالب":"Test",role]);}
  planId=(await db.query<{id:string}>("select id from subscription_plans where slug='one-month'")).rows[0].id;
  methodId=(await db.query<{id:string}>("insert into payment_methods(name,type,instructions) values('PalPay','wallet','حوّل المبلغ') returning id")).rows[0].id;
});
after(()=>db.close());

test("production payment methods are seeded with the configured recipient",async()=>{
  const methods=await db.query<{name:string;account_holder:string;account_number:string|null;wallet_number:string|null;active:boolean}>("select name,account_holder,account_number,wallet_number,active from payment_methods where name in ('بنك فلسطين','جوال باي','بال باي') order by sort_order");
  assert.deepEqual(methods.rows.map(method=>method.name),['بنك فلسطين','جوال باي','بال باي']);
  assert.ok(methods.rows.every(method=>method.account_holder==='علي سهيل محمد الكحلوت'&&method.active));
  assert.equal(methods.rows[0].account_number,'0567508786');
  assert.ok(methods.rows.slice(1).every(method=>method.wallet_number==='0567508786'));
});

test("new account receives one configurable three-day trial",async()=>{const access=await getStudentEntitlements(userId);assert.equal(access.kind,"trial");assert.equal(access.entitlements.ai_questions_daily,10);assert.ok(new Date(access.endsAt!).getTime()-new Date(access.startsAt!).getTime()>=3*86400000-1000);});

test("trial daily AI and total image limits are atomically enforced",async()=>{for(let i=0;i<10;i++)await consumeUsage(userId,"ai_questions_daily");await assert.rejects(consumeUsage(userId,"ai_questions_daily"),/استخدمت الحد/);for(let i=0;i<3;i++)await consumeUsage(userId,"images_limit");await assert.rejects(consumeUsage(userId,"images_limit"),/استخدمت الحد/);});

test("payment snapshots price and approval is idempotent",async()=>{const receipt=new File([Buffer.from("89504e470d0a1a0a0000000d49484452","hex")],"receipt.png",{type:"image/png"});const payment=await createPaymentRequest(userId,planId,methodId,receipt);await db.query("update subscription_plans set price=99 where id=$1",[planId]);const snapshot=(await identityDb(userId).query<{price_snapshot:number}>("select price_snapshot from payment_requests where id=$1",[payment.id])).rows[0];assert.equal(Number(snapshot.price_snapshot),15);
  const first=await reviewPayment(adminId,payment.id,"approved"),second=await reviewPayment(adminId,payment.id,"approved");assert.equal(first.unchanged,false);assert.equal(second.unchanged,true);assert.equal((await db.query<{count:number}>("select count(*)::int count from user_subscriptions where payment_request_id=$1",[payment.id])).rows[0].count,1);const access=await getStudentEntitlements(userId);assert.equal(access.kind,"paid");});

test("renewal preserves remaining paid time",async()=>{const receipt=new File([Buffer.from("%PDF-1.4 second receipt")],"receipt.pdf",{type:"application/pdf"});const payment=await createPaymentRequest(userId,planId,methodId,receipt);const prior=(await db.query<{ends_at:string}>("select ends_at from user_subscriptions where user_id=$1 and kind='paid' order by ends_at desc limit 1",[userId])).rows[0];await reviewPayment(adminId,payment.id,"approved");const renewed=(await db.query<{starts_at:string;ends_at:string}>("select starts_at,ends_at from user_subscriptions where payment_request_id=$1",[payment.id])).rows[0];assert.equal(new Date(renewed.starts_at).getTime(),new Date(prior.ends_at).getTime());assert.ok(new Date(renewed.ends_at)>new Date(renewed.starts_at));});

test("a receipt whose bytes are not an image or PDF is rejected before anything is stored",async()=>{const before=(await db.query<{n:number}>("select count(*)::int n from stored_files where bucket='payment-receipts'")).rows[0].n;
  await assert.rejects(createPaymentRequest(strangerId,planId,methodId,new File([Buffer.from("<html>fake</html>")],"receipt.png",{type:"image/png"})),/صالحًا/);
  assert.equal((await db.query<{n:number}>("select count(*)::int n from stored_files where bucket='payment-receipts'")).rows[0].n,before);});

test("simultaneous approvals of one payment create exactly one subscription",async()=>{const payment=await createPaymentRequest(strangerId,planId,methodId,new File([Buffer.from("%PDF-1.4 race")],"r.pdf",{type:"application/pdf"}));
  const results=await Promise.allSettled([reviewPayment(adminId,payment.id,"approved"),reviewPayment(adminId,payment.id,"approved")]);
  assert.ok(results.every(result=>result.status==="fulfilled"));
  assert.equal((await db.query<{count:number}>("select count(*)::int count from user_subscriptions where payment_request_id=$1",[payment.id])).rows[0].count,1);
  assert.equal((await db.query<{count:number}>("select count(*)::int count from admin_audit_logs where event_type='PAYMENT_APPROVED' and metadata->>'paymentRequestId'=$1",[payment.id])).rows[0].count,1);});

test("a rejected payment shows the reason to its owner only, and approving it later is refused",async()=>{await db.query("update payment_requests set status='cancelled' where user_id=$1 and status='pending'",[userId]);
  const payment=await createPaymentRequest(userId,planId,methodId,new File([Buffer.from("%PDF-1.4 reject")],"r.pdf",{type:"application/pdf"}));
  await assert.rejects(reviewPayment(adminId,payment.id,"rejected"," "),/سبب الرفض/);
  await reviewPayment(adminId,payment.id,"rejected","المبلغ غير مطابق");
  const own=(await identityDb(userId).query<{status:string;rejection_reason:string}>("select status,rejection_reason from payment_requests where id=$1",[payment.id])).rows[0];
  assert.deepEqual(own,{status:"rejected",rejection_reason:"المبلغ غير مطابق"});
  await assert.rejects(reviewPayment(adminId,payment.id,"approved"),/سابقًا/);
  const audit=(await db.query<{admin_id:string;created_at:string}>("select admin_id,created_at from admin_audit_logs where event_type='PAYMENT_REJECTED' and metadata->>'paymentRequestId'=$1",[payment.id])).rows[0];
  assert.equal(audit.admin_id,adminId);assert.ok(audit.created_at);});
