import { workerDb } from '@/lib/tutor/db';
export const DEFAULT_SUPPORT_WHATSAPP='+972567508786';
export function whatsappUrl(number:string,message='مرحبًا، أحتاج مساعدة في Nursing AI.'){
  return `https://wa.me/${number.replace(/\D/g,'')}?text=${encodeURIComponent(message)}`;
}
export async function getSupportWhatsapp(){
  try{const value=(await workerDb.query<{value:string}>("select value from settings where key='support_whatsapp_number'")).rows[0]?.value;
    return typeof value==='string'&&/^\+?[0-9]{8,15}$/.test(value)?value:DEFAULT_SUPPORT_WHATSAPP;
  }catch{return DEFAULT_SUPPORT_WHATSAPP;}
}
