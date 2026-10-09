import { createSupportTicket, readSupportTicket } from "@/lib/support";
export async function POST(request:Request){
  if(Number(request.headers.get("content-length"))>20000)return Response.json({error:"الطلب كبير جدًا"},{status:413});
  const text=await request.text();if(text.length>10000)return Response.json({error:"الطلب كبير جدًا"},{status:413});
  try{const body=JSON.parse(text);
    if(body.action==="status"){const ticket=await readSupportTicket(String(body.token??""));return Response.json(ticket?{ticket}:{error:"رمز المتابعة غير صحيح"},{status:ticket?200:404,headers:{"Cache-Control":"no-store"}});}
    return Response.json(await createSupportTicket(body),{status:201,headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"تحقق من البيانات أو حاول لاحقًا إذا أرسلت عدة طلبات"},{status:400});}
}
