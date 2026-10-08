import React, { useEffect, useState } from "react";
import { Moon, Sun, ExternalLink } from "lucide-react";
import { apiFetch, DEFAULT_SERVER_URL } from "../services/api";
import { openExternalUrl } from "../services/capacitor";
import { APP_VERSION_NAME } from "../config/version";
const defaults = {
  explanation_language: "ar",
  keep_medical_terms_english: true,
  explanation_depth: "normal",
  preferred_format: "mixed",
  preferred_explanation_style: "normal",
};
export function SettingsScreen() {
  const [preferences, setPreferences] = useState(defaults);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/profile/preferences", { signal: controller.signal })
      .then((data) => setPreferences((prev) => ({ ...prev, ...data })))
      .catch((err) => {
        if (!controller.signal.aborted) setStatus(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      await apiFetch("/api/profile/preferences", {
        method: "PUT",
        body: JSON.stringify(preferences),
      });
      setStatus("تم حفظ تفضيلات الدراسة");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "تعذر حفظ التفضيلات");
    } finally {
      setSaving(false);
    }
  };
  const change = (key: string, value: string | boolean) =>
    setPreferences((prev) => ({ ...prev, [key]: value }));
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("nursing_theme", next ? "dark" : "light");
  };
  return (
    <div className="space-y-4 pb-nav">
      <section className="surface space-y-4">
        <h2 className="font-black">تخصيص تجربة الدراسة</h2>
        <label className="block text-sm">
          لغة الشرح
          <select
            className="field w-full mt-2"
            value={preferences.explanation_language}
            onChange={(e) => change("explanation_language", e.target.value)}
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="block text-sm">
          مستوى التفصيل
          <select
            className="field w-full mt-2"
            value={preferences.explanation_depth}
            onChange={(e) => change("explanation_depth", e.target.value)}
          >
            <option value="simple">بسيط</option>
            <option value="normal">متوسط</option>
            <option value="detailed">مفصل</option>
          </select>
        </label>
        <label className="block text-sm">
          تنسيق الإجابة
          <select
            className="field w-full mt-2"
            value={preferences.preferred_format}
            onChange={(e) => change("preferred_format", e.target.value)}
          >
            <option value="bullets">نقاط</option>
            <option value="mixed">مختلط</option>
            <option value="paragraphs">فقرات</option>
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm min-h-12">
          <input
            type="checkbox"
            checked={preferences.keep_medical_terms_english}
            onChange={(e) =>
              change("keep_medical_terms_english", e.target.checked)
            }
          />
          إبقاء المصطلحات الطبية بالإنجليزية
        </label>
        <button
          disabled={saving || loading}
          className="btn-primary w-full"
          onClick={save}
        >
          {saving ? "جارٍ الحفظ..." : "حفظ التفضيلات"}
        </button>
        {status && (
          <p role="status" className="text-sm">
            {status}
          </p>
        )}
      </section>
      <button onClick={toggleTheme} className="btn-secondary w-full">
        {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        {dark ? "المظهر الفاتح" : "المظهر الداكن"}
      </button>
      <section className="surface space-y-3">
        <h3 className="font-bold">روابط ومساعدة</h3>
        {[
          { path: "/", label: "موقع Nursing AI" },
          { path: "/privacy", label: "سياسة الخصوصية" },
          { path: "/terms", label: "الشروط والأحكام" },
          { path: "/subscription-policy", label: "سياسة الاشتراك" },
          { path: "/file-policy", label: "سياسة الملفات" },
          { path: "/disclaimer", label: "إخلاء المسؤولية الطبية" },
        ].map((link) => (
          <button
            key={link.path}
            className="btn-secondary w-full justify-between"
            onClick={() => openExternalUrl(`${DEFAULT_SERVER_URL}${link.path}`)}
          >
            {link.label}
            <ExternalLink className="size-4" />
          </button>
        ))}
      </section>
      <p className="text-xs text-slate-500 text-center">
        Nursing AI · الإصدار {APP_VERSION_NAME}
      </p>
    </div>
  );
}
