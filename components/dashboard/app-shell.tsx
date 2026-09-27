"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap, Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import type { NavItem } from "@/components/dashboard/nav-items";
import { logoutAction } from "@/app/(auth)/actions";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function AppShell({
  navItems,
  homeHref,
  fullName,
  children,
}: {
  navItems: NavItem[];
  homeHref: string;
  fullName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-l border-border bg-white p-4 lg:flex lg:flex-col dark:bg-slate-900">
        <Link href={homeHref} className="mb-6 flex items-center gap-2 px-2 font-bold text-slate-900 dark:text-white">
          <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <GraduationCap className="size-5" />
          </span>
          Nursing AI
        </Link>
        <SidebarNav items={navItems} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72 p-4">
          <SheetTitle className="mb-6 flex items-center gap-2 px-2 font-bold text-slate-900 dark:text-white">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <GraduationCap className="size-5" />
            </span>
            Nursing AI
          </SheetTitle>
          <SidebarNav items={navItems} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-4 sm:px-6 dark:bg-slate-900">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="size-5" />
          </Button>

          <div className="hidden lg:block" />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex items-center gap-2 rounded-full outline-none">
                  <Avatar>
                    <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {initials(fullName || "ط")}
                    </AvatarFallback>
                  </Avatar>
                </button>
              }
            />
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5 text-sm font-medium">{fullName}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/dashboard/profile">حسابي</Link>} />
              <DropdownMenuItem
                render={
                  <form action={logoutAction} className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2 text-red-600">
                      <LogOut className="size-4" />
                      تسجيل الخروج
                    </button>
                  </form>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
