"use client";

import { useActionState } from "react";
import {
  updateMobileReleaseAction,
  updatePublicSiteAction,
  type SettingsActionState,
} from "@/app/admin/actions";
import type { AppVersionInfo } from "@/lib/version/app-version";
import type { PublicContactInfo } from "@/lib/public-site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: SettingsActionState = {};

function Feedback({ state }: { state: SettingsActionState }) {
  if (state.error) return <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="text-sm font-medium text-success">{state.success}</p>;
  return null;
}

export function MobileReleaseSettingsForm({ version }: { version: AppVersionInfo }) {
  const [state, action, pending] = useActionState(updateMobileReleaseAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="latestVersion">رقم الإصدار</Label>
          <Input id="latestVersion" name="latestVersion" dir="ltr" defaultValue={version.latest_version} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="latestVersionCode">Version Code</Label>
          <Input id="latestVersionCode" name="latestVersionCode" type="number" min={1} dir="ltr" defaultValue={version.latest_version_code} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="apkUrl">رابط APK الرسمي</Label>
        <Input id="apkUrl" name="apkUrl" dir="ltr" defaultValue={version.apk_url} required />
        <p className="text-xs text-muted-foreground">استخدم مسارًا محليًا مثل /api/download/apk أو رابط نطاق Nursing AI الرسمي.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="releaseNotes">ملاحظات الإصدار</Label>
        <Textarea id="releaseNotes" name="releaseNotes" rows={5} defaultValue={version.release_notes} required />
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <input id="forceUpdate" name="forceUpdate" type="checkbox" defaultChecked={version.force_update} className="mt-1 size-4 accent-primary" />
        <div>
          <Label htmlFor="forceUpdate">تحديث إلزامي</Label>
          <p className="text-xs leading-6 text-muted-foreground">فعّله فقط عندما لا يمكن للإصدار السابق الاستمرار بأمان.</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">الحجم المكتشف من ملف الإصدار الحالي: {version.file_size ?? "غير متوفر"}</p>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "جارٍ النشر..." : "نشر إعداد الإصدار"}</Button>
    </form>
  );
}

export function PublicSiteSettingsForm({ contact }: { contact: PublicContactInfo }) {
  const [state, action, pending] = useActionState(updatePublicSiteAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contactEmail">بريد الدعم</Label>
          <Input id="contactEmail" name="contactEmail" type="email" dir="ltr" defaultValue={contact.email} placeholder="support@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input id="whatsapp" name="whatsapp" dir="ltr" defaultValue={contact.whatsapp} placeholder="+970..." />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="refundPolicy">سياسة الاسترجاع الفعلية — اختياري</Label>
        <Textarea id="refundPolicy" name="refundPolicy" rows={4} defaultValue={contact.refundPolicy} />
        <p className="text-xs text-muted-foreground">اتركها فارغة إذا لم تعتمد الإدارة سياسة استرجاع بعد؛ لن يعرض الموقع سياسة مختلقة.</p>
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ معلومات الموقع"}</Button>
    </form>
  );
}
