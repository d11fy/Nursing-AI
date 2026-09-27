import {
  Home,
  MessageSquare,
  History,
  BookOpen,
  UserRound,
  LayoutDashboard,
  GraduationCap,
  Database,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const studentNavItems: NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", icon: Home },
  { href: "/dashboard/chat", label: "المحادثة", icon: MessageSquare },
  { href: "/dashboard/history", label: "المحادثات السابقة", icon: History },
  { href: "/dashboard/subjects", label: "المواد", icon: BookOpen },
  { href: "/dashboard/profile", label: "حسابي", icon: UserRound },
];

export const adminNavItems: NavItem[] = [
  { href: "/admin", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/admin/students", label: "الطلاب", icon: GraduationCap },
  { href: "/admin/knowledge", label: "قاعدة المعرفة", icon: Database },
  { href: "/admin/subjects", label: "المواد", icon: BookOpen },
  { href: "/admin/usage", label: "الاستخدام", icon: BarChart3 },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
];
