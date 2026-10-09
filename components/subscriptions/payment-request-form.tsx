"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import Link from "next/link";

export function PaymentRequestForm({planId,methods}:{planId:string;methods:Array<{id:string;name:string}>}){
  const [methodId,setMethodId]=useState(methods[0]?.id??"");const [message,setMessage]=useState("");const [failed,setFailed]=useState(false);const [pending,setPending]=useState(false);
  async function submit(formData:FormData){setPending(true);setMessage("");setFailed(false);formData.set("planId",planId);formData.set("methodId",methodId);
    try{const response=await fetch("/api/subscription/payments",{method:"POST",body:formData});const data=await response.json();
      setFailed(!response.ok);setMessage(response.ok?`تم إرسال الطلب بنجاح. المرجع: ${data.reference}`:data.error??"تعذر إرسال الطلب");if(response.ok)setTimeout(()=>location.reload(),900);
    }catch{setFailed(true);setMessage("تعذر الاتصال لإرسال إثبات الدفع. حاول مجددًا أو اطلب المساعدة.");}
    finally{setPending(false);}}
  if(!methods.length)return <p className="text-sm text-muted-foreground">لا توجد وسيلة دفع مفعلة حاليًا. <Link href="/support" className="text-primary underline">طلب مساعدة</Link></p>;
  return <form action={submit} className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
    <div className="space-y-1.5"><Label id={`payment-method-${planId}`}>وسيلة الدفع</Label><Select value={methodId} onValueChange={(value)=>setMethodId(value??"")}><SelectTrigger aria-labelledby={`payment-method-${planId}`}><SelectValue /></SelectTrigger><SelectContent>{methods.map(m=><SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label htmlFor={`receipt-${planId}`}>إثبات الدفع (JPG / PNG / PDF، بحد أقصى 5MB)</Label><Input id={`receipt-${planId}`} name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required /></div>
    {message&&<p role={failed?"alert":"status"} className="text-sm font-medium text-primary">{message}{failed&&<> <Link href="/support" className="underline">طلب مساعدة</Link></>}</p>}<Button disabled={pending||!methodId}>{pending?"جارٍ الإرسال...":"أرسلت الحوالة — إرسال الإثبات"}</Button>
  </form>;
}
