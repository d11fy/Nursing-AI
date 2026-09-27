import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function uploadChatImage(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File
): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("chat-images").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error(`تعذر رفع الصورة: ${error.message}`);

  const signedUrl = await getSignedChatImageUrl(supabase, path);
  return { path, signedUrl };
}

export async function getSignedChatImageUrl(
  supabase: SupabaseClient<Database>,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("chat-images")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) throw new Error("تعذر تحميل الصورة");
  return data.signedUrl;
}

export async function uploadKnowledgeDocument(
  supabase: SupabaseClient<Database>,
  file: File
): Promise<{ path: string }> {
  const path = `${crypto.randomUUID()}-${file.name}`;

  const { error } = await supabase.storage
    .from("knowledge-documents")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`تعذر رفع الملف: ${error.message}`);
  return { path };
}
