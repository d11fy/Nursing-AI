"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const selectClassName =
  "mt-2 h-11 w-full cursor-pointer rounded-xl border border-input bg-card px-3.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 sm:text-sm";

export function StudyPreferences() {
  const [data, setData] = useState({
    explanation_language: "ar",
    keep_medical_terms_english: true,
    explanation_depth: "normal",
    preferred_format: "mixed",
    preferred_explanation_style: "normal",
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/profile/preferences")
      .then((response) => response.json())
      .then((preferences) => setData((current) => ({ ...current, ...preferences })))
      .catch(() => {});
  }, []);

  const save = async () => {
    setStatus("جارٍ الحفظ...");
    const response = await fetch("/api/profile/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    setStatus(response.ok ? "تم حفظ تفضيلات الدراسة" : "تعذر الحفظ");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="explanation-language" className="text-sm font-medium">لغة الشرح</label>
          <select id="explanation-language" className={selectClassName} value={data.explanation_language} onChange={(event) => setData({ ...data, explanation_language: event.target.value })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label htmlFor="explanation-depth" className="text-sm font-medium">مستوى التفصيل</label>
          <select id="explanation-depth" className={selectClassName} value={data.explanation_depth} onChange={(event) => setData({ ...data, explanation_depth: event.target.value })}>
            <option value="simple">بسيط</option>
            <option value="normal">متوسط</option>
            <option value="detailed">مفصل</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="preferred-format" className="text-sm font-medium">تنسيق الإجابة</label>
        <select id="preferred-format" className={selectClassName} value={data.preferred_format} onChange={(event) => setData({ ...data, preferred_format: event.target.value })}>
          <option value="bullets">نقاط</option>
          <option value="mixed">مختلط</option>
          <option value="paragraphs">فقرات</option>
        </select>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/35 px-3.5 py-2.5 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={data.keep_medical_terms_english} onChange={(event) => setData({ ...data, keep_medical_terms_english: event.target.checked })} />
        إبقاء المصطلحات الطبية بالإنجليزية
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} className="min-w-36">حفظ التفضيلات</Button>
        {status && (
          <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            {status === "جارٍ الحفظ..." ? <Loader2 className="size-4 animate-spin" /> : status === "تم حفظ تفضيلات الدراسة" ? <CircleCheck className="size-4 text-success" /> : null}
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
