import { getAdminProfileOrNull } from '@/lib/auth';
export async function GET(){if(!await getAdminProfileOrNull())return Response.json({error:'غير مصرح'},{status:403});return Response.json({provider:'openai',model:'gpt-6-luna',systemPage:'/admin/ai-system'});}
