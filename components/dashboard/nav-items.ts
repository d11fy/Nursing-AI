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
  CalendarRange,
  FileText,
  ShieldCheck,
  Cpu,
  BrainCircuit,
  FileCheck2,
  HelpCircle,
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
  { href: "/admin/training-center", label: "مركز التدريب والجاهزية", icon: BrainCircuit },
  { href: "/admin/exams", label: "نماذج الامتحانات", icon: FileCheck2 },
  { href: "/admin/question-bank", label: "بنك الأسئلة", icon: HelpCircle },
  { href: "/admin/students", label: "الطلاب", icon: GraduationCap },
  { href: "/admin/knowledge", label: "قاعدة المعرفة", icon: Database },
  { href: "/admin/knowledge/contributions", label: "مراجعة المساهمات", icon: ShieldCheck },
  { href: "/admin/lectures", label: "محاضرات الطلاب", icon: FileText },
  { href: "/admin/subjects", label: "المواد", icon: BookOpen },
  { href: "/admin/academic-years", label: "السنوات الدراسية", icon: CalendarRange },
  { href: "/admin/usage", label: "الاستخدام", icon: BarChart3 },
  { href: "/admin/ai-system", label: "نظام الذكاء الاصطناعي", icon: Cpu },
  { href: "/admin/ai-usage", label: "تكاليف الذكاء الاصطناعي", icon: BarChart3 },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
];
