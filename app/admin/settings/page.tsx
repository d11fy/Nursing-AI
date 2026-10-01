import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { SettingsForm } from "@/components/admin/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Settings } from "lucide-react";

export default async function AdminSettingsPage() {
  const db = await createClient();
  const settings = await getSettings(db);

  return (
    <div className="page-container mx-auto max-w-xl space-y-6">
      <PageHeader icon={Settings} eyebrow="إدارة المنصة" title="الإعدادات" description="اضبط الحدود التشغيلية والاستخدام المسموح للطلاب." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">حدود الاستخدام</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
