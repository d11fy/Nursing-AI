"use client";

import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resetStudentDeviceAction, setStudentStatusAction, resetDailyLimitAction } from "@/app/admin/actions";
import { cancelSubscriptionAction, resetTrialAction, resetUsageAction } from "@/app/admin/subscriptions/actions";
import type { UserStatus } from "@/types/database";

export function StudentActions({ userId, status }: { userId: string; status: UserStatus }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8">
            <MoreVertical className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <form action={setStudentStatusAction}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="status" value={status === "active" ? "suspended" : "active"} />
              <button type="submit" className="w-full text-right">
                {status === "active" ? "تعليق الحساب" : "تفعيل الحساب"}
              </button>
            </form>
          }
        />
        <DropdownMenuItem
          render={
            <form action={resetDailyLimitAction}>
              <input type="hidden" name="userId" value={userId} />
              <button type="submit" className="w-full text-right">
                إعادة تعيين الحد اليومي
              </button>
            </form>
          }
        />
        <DropdownMenuItem
          render={
            <form action={resetStudentDeviceAction}>
              <input type="hidden" name="userId" value={userId} />
              <button type="submit" className="w-full text-right">
                إعادة تعيين جهاز الطالب
              </button>
            </form>
          }
        />
        <DropdownMenuItem render={<form action={resetTrialAction}><input type="hidden" name="userId" value={userId} /><button type="submit" className="w-full text-right">إعادة تعيين التجربة</button></form>} />
        <DropdownMenuItem render={<form action={resetUsageAction}><input type="hidden" name="userId" value={userId} /><button type="submit" className="w-full text-right">إعادة كل استخدام الاشتراك</button></form>} />
        <DropdownMenuItem render={<form action={cancelSubscriptionAction}><input type="hidden" name="userId" value={userId} /><input type="hidden" name="mode" value="cancelled" /><button type="submit" className="w-full text-right">إلغاء الاشتراك</button></form>} />
        <DropdownMenuItem render={<form action={cancelSubscriptionAction}><input type="hidden" name="userId" value={userId} /><input type="hidden" name="mode" value="revoked" /><button type="submit" className="w-full text-right text-destructive">سحب الاشتراك فورًا</button></form>} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
