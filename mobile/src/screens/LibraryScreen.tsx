import React, { useEffect, useState } from "react";
import { BookMarked, Search, Star, Sparkles, Filter, ChevronLeft, RefreshCw, FileText } from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";

interface Resource {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  subject_name?: string | null;
  page_count?: number | null;
  is_favorite?: boolean;
}

const CATEGORIES = [
  { value: "all", label: "الكل" },
  { value: "books", label: "كتب ومراجع" },
  { value: "guides", label: "أدلة سريرية" },
  { value: "summaries", label: "ملخصات" },
  { value: "questions", label: "نماذج وأسئلة" },
];

export function LibraryScreen() {
  const { navigate } = useNavigation();

  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("category", selectedCategory);
      if (search.trim()) params.append("q", search.trim());
      params.append("pageSize", "25");

      const res = await apiFetch(`/api/library?${params.toString()}`);
      setResources(res.items || res.resources || []);
    } catch (err) {
      console.warn("Failed fetching library:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchResources();
  };

  const toggleFavorite = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch("/api/library/favorites", {
        method: "POST",
        body: JSON.stringify({ documentId: docId }),
      });
      setResources((prev) =>
        prev.map((r) => (r.id === docId ? { ...r, is_favorite: !r.is_favorite } : r))
      );
    } catch (err: any) {
      alert(err.message || "تعذر تحديث المفضلة");
    }
  };

  const openStudyPack = async (resource: Resource) => {
    try {
      const res = await apiFetch(`/api/library/${resource.id}/study-pack`, {
        method: "POST",
      });
      navigate("study-pack", {
        id: resource.id,
        type: "library",
        studyPackId: res.studyPackId,
        title: resource.title,
      });
    } catch (err: any) {
      alert(err.message || "تعذر فتح حزمة الدراسة لهذا المصدر");
    }
  };

  const displayed = onlyFavorites ? resources.filter((r) => r.is_favorite) : resources;

  return (
    <div className="space-y-4 pb-nav">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في مراجع وكتب التمريض..."
          className="w-full h-11 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
        />
        <button
          type="submit"
          className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
        >
          <Search className="size-4" />
        </button>
      </form>

      {/* Category Pills & Favorite toggle */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button
          onClick={() => setOnlyFavorites(!onlyFavorites)}
          className={`flex items-center gap-1 h-8 px-3 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            onlyFavorites
              ? "bg-amber-500 text-white shadow-xs"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
          }`}
        >
          <Star className="size-3 fill-current" />
          <span>المفضلة</span>
        </button>

        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => {
              setSelectedCategory(cat.value);
              setOnlyFavorites(false);
            }}
            className={`h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === cat.value && !onlyFavorites
                ? "bg-primary text-white shadow-xs"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Resources List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-2">
          <RefreshCw className="size-6 text-primary animate-spin" />
          <span className="text-xs text-slate-400">جارٍ تحميل المكتبة...</span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-400">
          لم يتم العثور على مصادر في المكتبة.
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((res) => (
            <div
              key={res.id}
              onClick={() => openStudyPack(res)}
              className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-98 transition-all cursor-pointer space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 dark:bg-slate-800 text-primary">
                    <BookMarked className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {res.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {res.subject_name || "مرجع تمريضي عام"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => toggleFavorite(res.id, e)}
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                    res.is_favorite ? "text-amber-500" : "text-slate-300 hover:text-slate-500"
                  }`}
                  aria-label="المفضلة"
                >
                  <Star className="size-4.5 fill-current" />
                </button>
              </div>

              {res.description && (
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {res.description}
                </p>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs font-bold text-primary">
                <span className="flex items-center gap-1">
                  <Sparkles className="size-3.5" />
                  فتح حزمة الدراسة (Study Pack)
                </span>
                <ChevronLeft className="size-4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
