import React, { useState } from "react";
import { User, Mail, GraduationCap, ShieldCheck, LogOut, Settings, Edit2, Check, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";
import { BottomSheet } from "../components/common/BottomSheet";

export function ProfileScreen() {
  const { profile, access, logout, refreshAuth } = useAuth();
  const { navigate } = useNavigation();

  // Edit profile state
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [university, setUniversity] = useState(profile?.university || "");
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !university.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullName.trim(),
          university: university.trim(),
        }),
      });
      await refreshAuth();
      setShowEditSheet(false);
    } catch (err: any) {
      alert(err.message || "تعذر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) return;
    await logout();
  };

  return (
    <div className="space-y-4 pb-nav">
      {/* Profile Card Header */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-teal-50 dark:bg-slate-800 text-primary font-black text-xl">
            {profile?.full_name?.charAt(0) || "ط"}
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">
              {profile?.full_name}
            </h2>
            <p className="text-xs text-slate-500 font-medium" dir="ltr">
              {profile?.email}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setFullName(profile?.full_name || "");
            setUniversity(profile?.university || "");
            setShowEditSheet(true);
          }}
          className="flex size-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95"
          aria-label="تعديل البيانات"
        >
          <Edit2 className="size-4" />
        </button>
      </div>

      {/* Account Info Details */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider px-1">
          بيانات الحساب والدراسة
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-500 flex items-center gap-2">
              <GraduationCap className="size-4 text-primary" />
              الجامعة
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {profile?.university || "الجامعة الإسلامية بغزة"}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-500 flex items-center gap-2">
              <User className="size-4 text-primary" />
              المرحلة
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {profile?.nursing_year === "year1"
                ? "السنة الأولى"
                : profile?.nursing_year === "year2"
                ? "السنة الثانية"
                : profile?.nursing_year === "year3"
                ? "السنة الثالثة"
                : profile?.nursing_year === "year4"
                ? "السنة الرابعة"
                : "تمريض"}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-500 flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              الخطة والاشتراك
            </span>
            <span className="font-bold text-teal-700 dark:text-teal-400">
              {access?.planName || "الخطة التجريبية"}
            </span>
          </div>
        </div>
      </div>

      {/* Single Device Policy Banner */}
      <div className="p-4 rounded-3xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/60 space-y-1.5 text-xs">
        <div className="flex items-center gap-2 font-black text-primary dark:text-teal-300">
          <ShieldCheck className="size-4.5" />
          <span>حماية الحساب وجهاز الطالب</span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          هذا الحساب محمي بنظام الجهاز الواحد. جلستك الحالية مخصصة لهذا الهاتف للحفاظ على خصوصيتك وسجل تقدمك.
        </p>
      </div>

      {/* Settings & Logout */}
      <div className="space-y-2 pt-1">
        <button
          onClick={() => navigate("settings")}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-98 transition-all text-xs font-bold text-slate-700 dark:text-slate-200"
        >
          <div className="flex items-center gap-2.5">
            <Settings className="size-4 text-slate-400" />
            <span>إعدادات التطبيق والخادم</span>
          </div>
          <span className="text-slate-400">›</span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 text-xs font-bold active:scale-98 transition-all"
        >
          <LogOut className="size-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>

      {/* Edit Profile Bottom Sheet */}
      <BottomSheet
        isOpen={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        title="تعديل البيانات الشخصية"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">الاسم الكامل</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">الجامعة</label>
            <input
              type="text"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              required
              className="w-full h-11 rounded-xl border border-slate-200 px-3 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-xs active:scale-97 disabled:opacity-60"
          >
            {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
