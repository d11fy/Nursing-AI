import { getSupportWhatsapp } from '@/lib/support-contact';
export async function GET(){return Response.json({whatsapp:await getSupportWhatsapp()},{headers:{'Cache-Control':'no-store'}});}
