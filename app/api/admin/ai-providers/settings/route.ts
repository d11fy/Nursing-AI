import { getAdminProfileOrNull } from '@/lib/auth';
export async function POST(){if(!await getAdminProfileOrNull())return Response.json({error:'غير مصرح'},{status:403});return Response.json({error:'Provider routing has been retired; OpenAI is the only provider.'},{status:410});}
