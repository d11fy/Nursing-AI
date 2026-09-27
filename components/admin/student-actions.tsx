"use client";

import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setStudentStatusAction, resetDailyLimitAction } from "@/app/admin/actions";
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
