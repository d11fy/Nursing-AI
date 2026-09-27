import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-xl font-bold">هذه المادة غير متاحة لسنتك الدراسية.</h1>
    <p className="text-sm text-muted-foreground">يمكنك العودة إلى قائمة المواد المتاحة في حسابك.</p>
    <Button nativeButton={false} render={<Link href="/dashboard/subjects">العودة إلى المواد</Link>} />
  </div>;
}
