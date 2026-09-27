"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { z } from "zod";

const renameSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
});

export async function renameConversationAction(formData: FormData) {
  const profile = await requireProfile();
  const parsed = renameSchema.safeParse({
    conversationId: formData.get("conversationId"),
    title: formData.get("title"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("conversations")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.conversationId)
    .eq("user_id", profile.user_id);

  revalidatePath("/dashboard/history");
}

export async function deleteConversationAction(formData: FormData) {
  const profile = await requireProfile();
  const conversationId = formData.get("conversationId");
  if (typeof conversationId !== "string") return;

  const supabase = await createClient();
  await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", profile.user_id);

  revalidatePath("/dashboard/history");
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2),
  university: z.string().trim().min(1),
  nursingYear: z.enum(["year1", "year2", "year3", "year4", "other"]),
});

export interface ProfileActionState {
  error?: string;
  success?: string;
}

export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const profile = await requireProfile();
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    university: formData.get("university"),
    nursingYear: formData.get("nursingYear"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      university: parsed.data.university,
      nursing_year: parsed.data.nursingYear,
    })
    .eq("user_id", profile.user_id);

  if (error) return { error: "تعذر حفظ التعديلات" };

  revalidatePath("/dashboard/profile");
  return { success: "تم حفظ التعديلات بنجاح" };
}
