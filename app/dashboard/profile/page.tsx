import { requireProfile } from "@/lib/auth";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAcademicYears } from "@/lib/subjects";

export default async function ProfilePage() {
  const profile = await requireProfile();
  const years = await getAcademicYears(true);
  const academicYearName = years.find((year) => year.id === profile.academic_year_id)?.name_ar ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">حسابي</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المعلومات الشخصية</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={profile} academicYearName={academicYearName} />
        </CardContent>
      </Card>
    </div>
  );
}
