import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/usage";
import { SettingsForm } from "@/components/admin/settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Settings } from "lucide-react";
import { getPublicSiteData } from "@/lib/public-site";
import { MobileReleaseSettingsForm, PublicSiteSettingsForm } from "@/components/admin/release-settings-forms";

export default async function AdminSettingsPage() {
  const db = await createClient();
  const [settings, publicData] = await Promise.all([getSettings(db), getPublicSiteData()]);

  return (
    <div className="page-container mx-auto max-w-5xl space-y-6">
      <PageHeader icon={Settings} eyebrow="إدارة المنصة" title="الإعدادات" description="اضبط الحدود التشغيلية، معلومات الموقع، وإصدار تطبيق Android من مكان واحد." />
      <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">حدود الاستخدام</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">معلومات الدعم والسياسات</CardTitle></CardHeader>
        <CardContent><PublicSiteSettingsForm contact={publicData.contact} /></CardContent>
      </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">إصدار تطبيق Android</CardTitle></CardHeader>
        <CardContent><MobileReleaseSettingsForm version={publicData.appVersion} /></CardContent>
      </Card>
    </div>
  );
}
