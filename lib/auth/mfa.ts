import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { getPool, transaction } from "@/lib/db/pool";
import { tokenHash } from "./password";
import { matchTotp, newTotpSecret } from "./totp";
export class MfaRequiredError extends Error { constructor(){super("أدخل رمز تطبيق المصادقة أو رمز الاسترداد");} }
function key(){const secret=process.env.AUTH_SECRET;if(!secret || secret.length<32)throw new Error("AUTH_SECRET required");return createHash("sha256").update(`mfa:${secret}`).digest();}
function seal(value:string){const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key(),iv);const data=Buffer.concat([c.update(value,"utf8"),c.final()]);return [iv,c.getAuthTag(),data].map(b=>b.toString("base64")).join(".");}
function open(value:string){const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,"base64"));const c=createDecipheriv("aes-256-gcm",key(),iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString("utf8");}
export async function mfaEnabled(userId:string){return Boolean((await getPool().query("select 1 from admin_second_factors where user_id=$1 and enabled",[userId])).rows.length);}
export async function prepareMfa(userId:string,email:string){
  const secret=newTotpSecret();
  const result=await getPool().query(`insert into admin_second_factors(user_id,secret_ciphertext) values($1,$2)
    on conflict(user_id) do update set secret_ciphertext=excluded.secret_ciphertext,last_counter=-1,created_at=now()
    where not admin_second_factors.enabled returning user_id`,[userId,seal(secret)]);
  if(!result.rows.length)throw new Error("التحقق بخطوتين مفعّل بالفعل");
  return {secret,uri:`otpauth://totp/${encodeURIComponent(`Nursing AI:${email}`)}?secret=${secret}&issuer=Nursing%20AI&algorithm=SHA1&digits=6&period=30`};
}
/** Atomic code consumption prevents replay across concurrent logins. */
export async function verifyMfa(userId:string,code:string,enroll=false){
  const normalized=code.trim().replace(/\s/g,"");
  return transaction(async db=>{
    const row=(await db.query<{secret_ciphertext:string;enabled:boolean;last_counter:number;recovery_hashes:string[];created_at:string}>("select * from admin_second_factors where user_id=$1 for update",[userId])).rows[0];
    if(!row || (enroll ? row.enabled || Date.now()-new Date(row.created_at).getTime()>600000 : !row.enabled))return null;
    const counter=matchTotp(open(row.secret_ciphertext),normalized,Number(row.last_counter));
    const recovery=tokenHash(normalized.toLowerCase());
    if(counter===null && (enroll || !row.recovery_hashes.includes(recovery)))return null;
    const codes=enroll?Array.from({length:8},()=>randomBytes(12).toString("hex")):[];
    await db.query("update admin_second_factors set enabled=true,last_counter=$2,recovery_hashes=$3::jsonb where user_id=$1",[userId,counter??row.last_counter,JSON.stringify(enroll?codes.map(tokenHash):row.recovery_hashes.filter(h=>h!==recovery))]);
    return {recoveryCodes:codes};
  });
}
export async function markSessionMfa(token:string){await getPool().query("update app_sessions set mfa_verified_at=now() where token_hash=$1 and revoked_at is null and expires_at>now()",[tokenHash(token)]);}
