"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, LogOut, ChevronDown } from "lucide-react";
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
import { adminNavItems, studentNavItems } from "@/components/dashboard/nav-items";
import { logoutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/brand/brand-mark";

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
  area,
  homeHref,
  fullName,
  children,
}: {
  area: "student" | "admin";
  homeHref: string;
  fullName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navItems = area === "admin" ? adminNavItems : studentNavItems;

  return (
    <div className="app-shell flex h-dvh min-h-0 bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-l border-sidebar-border bg-sidebar px-4 py-5 lg:flex lg:flex-col">
        <Link href={homeHref} className="mb-7 rounded-xl px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark />
        </Link>
        <p className="mb-2 px-3 text-[11px] font-bold tracking-wide text-muted-foreground">{area === "admin" ? "الإدارة" : "مساحة الدراسة"}</p>
        <SidebarNav items={navItems} />
        <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-border px-2 pt-5">
          <Avatar><AvatarFallback className="bg-accent text-primary">{initials(fullName || "ط")}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{fullName}</p>
            <p className="text-xs text-muted-foreground">{area === "admin" ? "حساب إداري" : "طالب تمريض"}</p>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[min(20rem,88vw)] p-5">
          <SheetTitle className="mb-6 px-2">
            <BrandMark />
          </SheetTitle>
          <SidebarNav items={navItems} onNavigate={() => setOpen(false)} />
          <div className="mt-auto flex items-center gap-3 border-t border-border pt-5">
            <Avatar><AvatarFallback className="bg-accent text-primary">{initials(fullName || "ط")}</AvatarFallback></Avatar>
            <span className="truncate text-sm font-medium">{fullName}</span>
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-16 shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-7">
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
                <button className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-transparent px-1.5 py-1 outline-none transition-colors hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary">
                  <Avatar>
                    <AvatarFallback className="bg-accent font-semibold text-primary">
                      {initials(fullName || "ط")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-36 truncate text-sm font-medium sm:inline">{fullName}</span>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
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
                    <button type="submit" className="flex w-full items-center gap-2 text-destructive">
                      <LogOut className="size-4" />
                      تسجيل الخروج
                    </button>
                  </form>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="app-main min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</main>
      </div>
    </div>
  );
}
