import { requireProfile } from "@/lib/auth";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicYears } from "@/lib/subjects";
import { StudyPreferences } from "@/components/dashboard/study-preferences";
import { PageHeader } from "@/components/ui/page-header";
import { UserRound } from "lucide-react";

export default async function ProfilePage() {
  const profile = await requireProfile();
  const years = await getAcademicYears(true);
  const academicYearName = years.find((year) => year.id === profile.academic_year_id)?.name_ar ?? null;

  return (
    <div className="page-container mx-auto max-w-2xl space-y-6">
      <PageHeader icon={UserRound} eyebrow="إعدادات الحساب" title="حسابي" description="حدّث بياناتك واضبط طريقة الشرح التي تناسب دراستك." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المعلومات الشخصية</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} academicYearName={academicYearName} />
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">تخصيص تجربة الدراسة</CardTitle></CardHeader><CardContent><StudyPreferences /></CardContent></Card>
    </div>
  );
}
