import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { SettingsForm } from "@/components/admin/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSettingsPage() {
  const db = await createClient();
  const settings = await getSettings(db);

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">الإعدادات</h1>
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
