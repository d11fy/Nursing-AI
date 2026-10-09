import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { requestDeviceTransfer,confirmDeviceTransfer } from '@/lib/auth/device-transfer';
import { DEVICE_COOKIE,SESSION_COOKIE,deviceCookieOptions,sessionCookieOptions } from '@/lib/auth/session';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('request'),email:z.string().email().max(254),password:z.string().min(1).max(200)}),
  z.object({action:z.literal('confirm'),token:z.string().regex(/^[a-f0-9]{64}$/),deviceToken:z.string().regex(/^[a-f0-9]{64}$/).optional()}),
]);
export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'بيانات غير صالحة'},{status:400});
  try{
    if(parsed.data.action==='request'){
      await requestDeviceTransfer(parsed.data.email,parsed.data.password);
      return NextResponse.json({message:'إذا كانت البيانات صحيحة، ستصلك رسالة برمز نقل الجهاز صالح لمدة 15 دقيقة. أدخله على الجهاز الجديد.'});
    }
    const jar=await cookies();
    const session=await confirmDeviceTransfer(parsed.data.token,parsed.data.deviceToken||jar.get(DEVICE_COOKIE)?.value);
    jar.set(SESSION_COOKIE,session.sessionToken,sessionCookieOptions());jar.set(DEVICE_COOKIE,session.deviceToken,deviceCookieOptions());
    return NextResponse.json({success:true,...session},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'تعذر إتمام النقل؛ تحقق من الرمز أو اطلب رمزًا جديدًا'},{status:400});}
}
