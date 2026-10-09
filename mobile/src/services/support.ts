import { Browser } from '@capacitor/browser';
import { apiFetch } from './api';
const FALLBACK_NUMBER='+972567508786';
export async function openSupport(context='مرحبًا، أحتاج مساعدة في Nursing AI.'){
  let number=FALLBACK_NUMBER;
  try{const config=await apiFetch<{whatsapp:string}>('/api/support/config');if(/^\+?[0-9]{8,15}$/.test(config.whatsapp))number=config.whatsapp;}catch{}
  await Browser.open({url:`https://wa.me/${number.replace(/\D/g,'')}?text=${encodeURIComponent(context)}`});
}
