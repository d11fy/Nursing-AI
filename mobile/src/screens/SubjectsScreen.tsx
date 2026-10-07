import React, { useEffect, useState } from "react";
import { BookOpen, Search, Calendar, ChevronLeft, RefreshCw } from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";

interface Subject {
  id: string;
  name_ar: string;
  name_en: string;
  course_code?: string | null;
  course_type?: string | null;
  semester?: number | null;
  description_ar?: string | null;
}

export function SubjectsScreen() {
  const { navigate } = useNavigation();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYearName, setAcademicYearName] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSemester, setSelectedSemester] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/subjects");
      setSubjects(data.subjects || []);
      setAcademicYearName(data.academicYearName || null);
    } catch (err: any) {
      setError(err.message || "تعذر تحميل المواد");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const filtered = subjects.filter((s) => {
    const matchesSearch =
      s.name_ar.toLowerCase().includes(search.toLowerCase()) ||
      s.name_en.toLowerCase().includes(search.toLowerCase()) ||
      (s.course_code && s.course_code.toLowerCase().includes(search.toLowerCase()));

    const matchesSemester =
      selectedSemester === "all" || s.semester === selectedSemester;

    return matchesSearch && matchesSemester;
  });

  return (
    <div className="space-y-4 pb-nav">
      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن مادة أو رمز المساق..."
          className="w-full h-11 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
        />
        <Search className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
      </div>

      {/* Semester Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button
          onClick={() => setSelectedSemester("all")}
          className={`h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            selectedSemester === "all"
              ? "bg-primary text-white shadow-xs"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          كل المواد
        </button>
        <button
          onClick={() => setSelectedSemester(1)}
          className={`h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            selectedSemester === 1
              ? "bg-primary text-white shadow-xs"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          الفصل الأول
        </button>
        <button
          onClick={() => setSelectedSemester(2)}
          className={`h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            selectedSemester === 2
              ? "bg-primary text-white shadow-xs"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          الفصل الثاني
        </button>
      </div>

      {/* Academic Year Info */}
      {academicYearName && (
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-1">
          <Calendar className="size-3.5 text-primary" />
          <span>{academicYearName}</span>
        </div>
      )}

      {/* Loading & Error */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <RefreshCw className="size-6 text-primary animate-spin" />
          <span className="text-xs text-slate-400">جارٍ تحميل المواد...</span>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-600 text-center space-y-2">
          <p>{error}</p>
          <button
            onClick={fetchSubjects}
            className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-400">
          لم يتم العثور على مواد مطابقة.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((subject) => (
            <div
              key={subject.id}
              onClick={() =>
                navigate("subject-detail", {
                  subjectId: subject.id,
                  subjectName: subject.name_ar,
                })
              }
              className="flex flex-col p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-98 transition-all cursor-pointer space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-primary">
                    <BookOpen className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                      {subject.name_ar}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium" dir="ltr">
                      {subject.name_en}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 items-center">
                  {subject.course_code && (
                    <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                      {subject.course_code}
                    </span>
                  )}
                  {subject.course_type && (
                    <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {subject.course_type}
                    </span>
                  )}
                </div>
              </div>

              {subject.description_ar && (
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {subject.description_ar}
                </p>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/60 text-xs font-bold text-primary">
                <span>تصفح المحاضرات والامتحانات</span>
                <ChevronLeft className="size-4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
