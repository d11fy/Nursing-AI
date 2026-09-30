import {workerDb} from "@/lib/tutor/db";
import { validFileSignature } from "@/lib/storage";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const path = params.get("path") ?? "";
  if (!validFileSignature(path, params.get("expires") ?? "", params.get("signature") ?? "")) return new Response("Forbidden", { status: 403 });
  const { rows } = await workerDb.query<{content:Buffer;mime_type:string}>(
    "SELECT f.content,f.mime_type FROM stored_files f JOIN profiles p ON p.user_id=f.owner_id WHERE f.path=$1 AND f.bucket='chat-images' AND p.status='active'", [path]);
  if (!rows[0]) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rows[0].content), { headers: {
    "Content-Type": rows[0].mime_type,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
  } });
}
