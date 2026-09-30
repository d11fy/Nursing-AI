import { createClient } from '@/lib/db/server';
import { handleTutorChat } from '@/lib/tutor/chat';
export const runtime='nodejs';
export async function POST(request:Request) {
  if(process.env.AI_ARCHITECTURE==='legacy') return (await import('@/lib/legacy/chat')).POST(request);
  try {return await handleTutorChat(request,await createClient());}
  catch {return Response.json({error:'صار خلل مؤقت أثناء تجهيز الإجابة. جرّب مرة ثانية بعد لحظات.'},{status:503});}
}
