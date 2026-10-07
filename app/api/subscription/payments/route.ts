import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { limitedFormData } from "@/lib/request-body";
import { createPaymentRequest, MAX_RECEIPT_BYTES } from "@/lib/subscriptions/payments";
import { z } from "zod";

export const runtime="nodejs";
export async function POST(request:Request){
  const db=await createClient(),user=db.actor;
  if(!user||user.status!=="active")return NextResponse.json({error:"يجب تسجيل الدخول"},{status:401});
  try{
    const form=await limitedFormData(request,MAX_RECEIPT_BYTES+64*1024);
    const parsed=z.object({planId:z.string().uuid(),methodId:z.string().uuid()}).safeParse({planId:form.get("planId"),methodId:form.get("methodId")});
    const file=form.get("receipt");
    if(!parsed.success||!(file instanceof File))return NextResponse.json({error:"بيانات الدفع غير مكتملة"},{status:400});
    const result=await createPaymentRequest(user.user_id,parsed.data.planId,parsed.data.methodId,file);
    return NextResponse.json({ok:true,reference:result.payment_reference});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر إرسال طلب الدفع"},{status:400});}
}
