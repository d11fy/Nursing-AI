import 'server-only';
import { getPool } from '@/lib/db/pool';
import { allowAttempt } from './accounts';
import { newToken, tokenHash, verifyPassword } from './password';
import { establishSession } from './session-store';
import { enqueueTemplateEmail } from '@/lib/email-queue';

export async function requestDeviceTransfer(emailInput:string,password:string) {
  const email=emailInput.trim().toLowerCase();
  if(!await allowAttempt(`device-transfer:${email}`,3)||!await allowAttempt('device-transfer:global',100))return;
  const row=(await getPool().query("select u.id,u.password_hash,p.role,p.status from app_users u join profiles p on p.user_id=u.id where u.email=$1",[email])).rows[0];
  const valid=await verifyPassword(password,row?.password_hash??`scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`);
  if(!valid||row?.role!=='student'||row.status!=='active')return;
  const token=newToken();
  await getPool().query("delete from device_transfers where user_id=$1 or expires_at<now()",[row.id]);
  await getPool().query("insert into device_transfers(token_hash,user_id,expires_at) values($1,$2,now()+interval '15 minutes')",[tokenHash(token),row.id]);
  // Copy the code into the target device. Following a link never revokes a session.
  if(!await enqueueTemplateEmail(email,'device_transfer',{transfer_code:token}))throw new Error('تعذر تجهيز رسالة نقل الجهاز');
}
export async function confirmDeviceTransfer(token:string,deviceToken?:string){
  if(!/^[a-f0-9]{64}$/.test(token)||!await allowAttempt('device-transfer-confirm:global',100))throw new Error('رمز النقل غير صالح أو منتهي');
  const row=(await getPool().query<{user_id:string}>('select user_id from device_transfers where token_hash=$1 and expires_at>now()',[tokenHash(token)])).rows[0];
  if(!row)throw new Error('رمز النقل غير صالح أو منتهي');
  return establishSession(row.user_id,deviceToken,token);
}
