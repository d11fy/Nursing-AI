import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import type { DatabaseClient } from "@/lib/db/server";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
function signature(path: string, expires: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(`${path}\n${expires}`).digest("hex");
}
export function validFileSignature(path: string, expires: string, supplied: string) {
  if (!/^\d{10,13}$/.test(expires) || Number(expires) < Date.now() || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(signature(path, expires), "hex"), Buffer.from(supplied, "hex"));
}
async function store(db: DatabaseClient, bucket: string, path: string, file: File, maximum: number) {
  if (!db.actor || db.actor.status !== "active") throw new Error("غير مصرح");
  if (!file.size || file.size > maximum) throw new Error(`حجم الملف يجب ألا يتجاوز ${maximum / 1024 / 1024} ميجابايت`);
  await getPool().query("INSERT INTO stored_files(path,bucket,owner_id,mime_type,content) VALUES($1,$2,$3,$4,$5)",
    [path, bucket, db.actor.user_id, file.type || "application/octet-stream", Buffer.from(await file.arrayBuffer())]);
}
export async function uploadChatImage(db: DatabaseClient, userId: string, file: File) {
  if (db.actor?.user_id !== userId || !IMAGE_TYPES.has(file.type)) throw new Error("صورة غير صالحة");
  const path = `${userId}/${randomUUID()}`;
  await store(db, "chat-images", path, file, 8 * 1024 * 1024);
  return { path, signedUrl: await getSignedChatImageUrl(db, path) };
}
export async function getSignedChatImageUrl(db: DatabaseClient, path: string) {
  if (!db.actor || db.actor.status !== "active") throw new Error("غير مصرح");
  const { rows } = await getPool().query("SELECT owner_id FROM stored_files WHERE path=$1 AND bucket='chat-images'", [path]);
  if (!rows[0] || (rows[0].owner_id !== db.actor.user_id && db.actor.role !== "admin")) throw new Error("تعذر تحميل الصورة");
  const expires = String(Date.now() + 60 * 60 * 1000);
  const origin = process.env.APP_URL;
  if (!origin) throw new Error("APP_URL is required");
  const url = new URL("/api/files", origin);
  url.searchParams.set("path", path);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature(path, expires));
  return url.toString();
}
export async function uploadKnowledgeDocument(db: DatabaseClient, file: File) {
  if (db.actor?.role !== "admin") throw new Error("غير مصرح");
  const path = `knowledge/${randomUUID()}`;
  await store(db, "knowledge-documents", path, file, MAX_DOCUMENT_BYTES);
  return { path };
}
export async function downloadKnowledgeDocument(path: string): Promise<Buffer> {
  const { rows } = await getPool().query("SELECT content FROM stored_files WHERE path=$1 AND bucket='knowledge-documents'", [path]);
  if (!rows[0]) throw new Error("تعذر تحميل الملف");
  return rows[0].content;
}
export async function removeKnowledgeDocument(db: DatabaseClient, path: string) {
  if (db.actor?.role !== "admin" || db.actor.status !== "active") throw new Error("غير مصرح");
  await getPool().query("DELETE FROM stored_files WHERE path=$1 AND bucket='knowledge-documents'", [path]);
}
