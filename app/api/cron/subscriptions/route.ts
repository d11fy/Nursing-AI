import { runSubscriptionJobs } from "@/lib/subscriptions/jobs";

export const runtime="nodejs";
export async function POST(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:"Unauthorized"},{status:401});return Response.json(await runSubscriptionJobs());}
