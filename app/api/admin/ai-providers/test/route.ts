import { getAdminProfileOrNull } from '@/lib/auth';
import { getAIProvider } from '@/lib/ai';
export async function POST(){if(!await getAdminProfileOrNull())return Response.json({error:'غير مصرح'},{status:403});return Response.json(await getAIProvider().healthCheck());}
