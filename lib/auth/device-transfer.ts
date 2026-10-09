import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { getPool,transaction } from '@/lib/db/pool';
import { workerDb } from '@/lib/tutor/db';
import { allowAttempt } from './accounts';
import { verifyPassword } from './password';
import { establishSession } from './session-store';
import { enqueueTemplateEmail, sendDirectTemplateEmail } from '@/lib/email-queue';

const generic='إذا كانت بيانات الحساب صحيحة، أرسلنا رمز نقل مكونًا من 6 أرقام إلى بريدك.';
function otpHash(userId:string,code:string){const secret=process.env.AUTH_SECRET;if(!secret||secret.length<32)throw new Error('AUTH_SECRET required');
  return createHmac('sha256',secret).update(`device-transfer:${userId}:${code}`).digest('hex');}
function mask(email:string){const [local,domain]=email.split('@');return `${local.slice(0,1)}***@${domain}`;}
async function event(userId:string,type:'DEVICE_TRANSFER_OTP_SENT'|'DEVICE_TRANSFER_OTP_FAILED'|'DEVICE_TRANSFER_SUCCESS'|'DEVICE_TRANSFER_DENIED'){
  await workerDb.query('insert into device_transfer_events(user_id,event_type) values($1,$2)',[userId,type]);
}
export async function requestDeviceTransfer(emailInput:string,password:string,deps:{send?:typeof sendDirectTemplateEmail}={}) {
  const email=emailInput.trim().toLowerCase();
  if(!await allowAttempt(`device-transfer:${email}`,3)||!await allowAttempt('device-transfer:global',100))return {message:generic,maskedEmail:mask(email),retryAfterSeconds:60};
  const row=(await getPool().query<{id:string;password_hash:string;role:string;status:string;full_name:string}>(
    'select u.id,u.password_hash,p.role,p.status,p.full_name from app_users u join profiles p on p.user_id=u.id where u.email=$1',[email])).rows[0];
  const valid=await verifyPassword(password,row?.password_hash??`scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`);
  if(!valid||row?.role!=='student'||row.status!=='active')return {message:generic,maskedEmail:mask(email),retryAfterSeconds:60};
  const code=String(randomInt(0,1_000_000)).padStart(6,'0');
  const result=await transaction(async db=>{
    await db.query('select id from app_users where id=$1 for update',[row.id]);
    const previous=(await db.query<{seconds:number}>("select extract(epoch from now()-created_at)::int as seconds from device_transfers where user_id=$1",[row.id])).rows[0];
    if(previous&&previous.seconds<60)return {sent:false,cooldown:60-previous.seconds};
    await db.query('delete from device_transfers where user_id=$1 or expires_at<now()',[row.id]);
    await db.query("insert into device_transfers(token_hash,user_id,expires_at) values($1,$2,now()+interval '10 minutes')",[otpHash(row.id,code),row.id]);
    return {sent:true,cooldown:60};
  });
  if(result.sent){
    try{await (deps.send??sendDirectTemplateEmail)(email,'device_transfer',{student_name:row.full_name,transfer_code:code});}
    catch{
      await getPool().query('delete from device_transfers where user_id=$1 and token_hash=$2',[row.id,otpHash(row.id,code)]);
      await event(row.id,'DEVICE_TRANSFER_OTP_FAILED').catch(()=>{});
      throw new Error('تعذر إرسال رمز النقل الآن؛ حاول لاحقًا أو تواصل مع الدعم');
    }
    await event(row.id,'DEVICE_TRANSFER_OTP_SENT').catch(()=>{});
  }
  return {message:generic,maskedEmail:mask(email),retryAfterSeconds:result.cooldown};
}
export async function confirmDeviceTransfer(emailInput:string,code:string,deviceToken?:string){
  const email=emailInput.trim().toLowerCase();
  if(!/^\d{6}$/.test(code)||!await allowAttempt(`device-transfer-confirm:${email}`,10))throw new Error('رمز النقل غير صالح أو انتهت محاولات التحقق');
  const row=(await getPool().query<{id:string}>("select id from app_users where email=$1",[email])).rows[0];
  if(!row)throw new Error('رمز النقل غير صالح أو انتهت محاولات التحقق');
  const verification=await transaction(async db=>{
    const active=(await db.query<{token_hash:string;attempts:number;expires_at:string}>(
      'select token_hash,attempts,expires_at from device_transfers where user_id=$1 for update',[row.id])).rows[0];
    if(!active||active.attempts>=5||new Date(active.expires_at).getTime()<=Date.now())return null;
    const actual=Buffer.from(otpHash(row.id,code),'hex'),expected=Buffer.from(active.token_hash,'hex');
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){
      await db.query('update device_transfers set attempts=attempts+1 where user_id=$1',[row.id]);return null;
    }
    return active.token_hash;
  });
  if(!verification){await event(row.id,'DEVICE_TRANSFER_DENIED').catch(()=>{});throw new Error('رمز النقل غير صحيح أو منتهي');}
  let session;
  try{session=await establishSession(row.id,deviceToken,verification);}
  catch{await event(row.id,'DEVICE_TRANSFER_DENIED').catch(()=>{});throw new Error('رمز النقل مستخدم أو انتهى');}
  await event(row.id,'DEVICE_TRANSFER_SUCCESS').catch(()=>{});
  await enqueueTemplateEmail(email,'security_alert',{}).catch(()=>null);
  return session;
}
