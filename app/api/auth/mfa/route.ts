import { cookies, headers } from "next/headers";
import { currentProfile, SESSION_COOKIE } from "@/lib/auth/session";
import { allowAttempt } from "@/lib/auth/accounts";
import { mfaEnabled, prepareMfa, verifyMfa, markSessionMfa } from "@/lib/auth/mfa";
import { getPool } from "@/lib/db/pool";
import { verifyPassword } from "@/lib/auth/password";

export async function POST(request:Request){
  const profile=await currentProfile(true);
  if(!profile || profile.role!=="admin")return Response.json({error:"غير مصرح"},{status:403});
  const body=await request.json().catch(()=>({}));
  const enabled=await mfaEnabled(profile.user_id);
  if(body.action==="status")return Response.json({enabled,verified:Boolean(await currentProfile())});
  if(!await allowAttempt(`mfa:${profile.user_id}`,8))return Response.json({error:"حاول بعد 15 دقيقة"},{status:429});
  const jar=await cookies(),head=await headers();
  const token=jar.get(SESSION_COOKIE)?.value ?? head.get("authorization")?.replace(/^Bearer /,"");
  if(!token)return Response.json({error:"جلسة غير صالحة"},{status:401});
  if(body.action==="setup"){
    if(!await currentProfile())return Response.json({error:"تحقق من هويتك أولًا"},{status:403});
    const row=(await getPool().query("select password_hash from app_users where id=$1",[profile.user_id])).rows[0];
    if(typeof body.password!=="string" || !await verifyPassword(body.password,row.password_hash))return Response.json({error:"كلمة المرور غير صحيحة"},{status:403});
    if(enabled)return Response.json({error:"التحقق مفعّل بالفعل"},{status:409});
    return Response.json(await prepareMfa(profile.user_id,profile.email),{headers:{"Cache-Control":"no-store"}});
  }
  if(body.action!=="verify" && body.action!=="confirm")return Response.json({error:"طلب غير صالح"},{status:400});
  const result=typeof body.code==="string" ? await verifyMfa(profile.user_id,body.code,body.action==="confirm") : null;
  if(!result)return Response.json({error:"الرمز غير صحيح أو استُخدم بالفعل"},{status:403});
  if(body.action==="confirm") await getPool().query("update app_sessions set mfa_verified_at=null where user_id=$1",[profile.user_id]);
  await markSessionMfa(token);
  return Response.json({success:true,...result},{headers:{"Cache-Control":"no-store"}});
}
