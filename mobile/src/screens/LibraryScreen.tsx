import React, { useEffect, useState } from "react";
import {
  BookMarked,
  Search,
  Star,
  Sparkles,
  RefreshCw,
  Eye,
  Download,
  MessageSquare,
} from "lucide-react";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";
import { openAuthenticatedFile } from "../services/files";
import {
  RESOURCE_CATEGORIES,
  categoryLabel,
  type LibraryCatalog,
  type LibraryResource,
} from "../config/library";

interface Resource extends Omit<LibraryResource, "subjectName"> {
  subjectName?: string | null;
  favorite?: boolean;
}
const CATEGORIES = [{ value: "all", label: "الكل" }, ...RESOURCE_CATEGORIES];

export function LibraryScreen({
  onAttach,
  subjectId: initialSubjectId,
}: {
  onAttach?: (resource: LibraryResource) => Promise<void>;
  subjectId?: string | null;
}) {
  const { navigate, showToast } = useNavigation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [catalog, setCatalog] = useState<LibraryCatalog | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [subjectId, setSubjectId] = useState(initialSubjectId || "");
  const [semester, setSemester] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "18" });
    if (selectedCategory !== "all") params.set("category", selectedCategory);
    if (query) params.set("q", query);
    if (subjectId) params.set("subjectId", subjectId);
    if (semester) params.set("semester", semester);
    apiFetch<LibraryCatalog>(`/api/library?${params}`, {
      signal: controller.signal,
    })
      .then((res) => {
        setCatalog(res);
        setResources(res.resources || []);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err.message || "تعذر تحميل المكتبة");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedCategory, query, subjectId, semester, page, retry]);

  const run = async (id: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    try {
      await action();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "تعذر تنفيذ الطلب");
    } finally {
      setBusy(null);
    }
  };
  const toggleFavorite = async (docId: string) =>
    run(docId, async () => {
      const resource = resources.find((item) => item.id === docId);
      const favorite = !resource?.favorite;
      await apiFetch("/api/library/favorites", {
        method: "PUT",
        body: JSON.stringify({ documentId: docId, favorite }),
      });
      setResources((prev) =>
        prev.map((r) => (r.id === docId ? { ...r, favorite } : r)),
      );
    });
  const openStudyPack = async (resource: Resource) =>
    run(resource.id, async () => {
      const res = await apiFetch(`/api/library/${resource.id}/study-pack`, {
        method: "POST",
      });
      navigate("study-pack", {
        id: res.studyPackId,
        studyPackId: res.studyPackId,
        title: resource.title,
      });
    });
  const attach = (resource: Resource) =>
    run(resource.id, async () => {
      if (onAttach) {
        await onAttach({
          ...resource,
          subjectName: resource.subjectName || null,
        });
        return;
      }
      const result = await apiFetch("/api/library/sources", {
        method: "POST",
        body: JSON.stringify({
          documentId: resource.id,
          subjectId: resource.subjectId,
        }),
      });
      navigate("chat-detail", {
        conversationId: result.conversationId,
        subjectId: resource.subjectId,
        subjectName: resource.subjectName,
      });
    });
  const displayed = onlyFavorites
    ? resources.filter((r) => r.favorite)
    : resources;

  return (
    <div className={`space-y-4 ${onAttach ? "" : "pb-nav"}`}>
      <div className="rounded-3xl bg-primary p-5 text-white space-y-2">
        <BookMarked className="size-6" />
        <h2 className="font-black text-lg">مكتبة منهجك في مكان واحد</h2>
        <p className="text-sm text-white/80">
          {catalog?.academicYear?.name || "مصادر الجامعة"} ·{" "}
          {catalog?.total ?? 0} مصدر متاح
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
          setRetry((v) => v + 1);
        }}
        className="flex gap-2"
      >
        <input
          aria-label="البحث في المكتبة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={100}
          placeholder="ابحث عن كتاب أو محاضرة..."
          className="field flex-1 min-w-0"
        />
        <button type="submit" aria-label="بحث" className="btn-primary px-4">
          <Search className="size-5" />
        </button>
      </form>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="المادة"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setPage(1);
          }}
          className="field min-w-0"
        >
          <option value="">كل المواد</option>
          {catalog?.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="الفصل الدراسي"
          value={semester}
          onChange={(e) => {
            setSemester(e.target.value);
            setPage(1);
          }}
          className="field"
        >
          <option value="">كل الفصول</option>
          <option value="1">الفصل الأول</option>
          <option value="2">الفصل الثاني</option>
        </select>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
          className={`chip ${onlyFavorites ? "bg-amber-500 text-white" : ""}`}
        >
          <Star className="size-4" />
          المفضلة
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            aria-pressed={selectedCategory === cat.value}
            onClick={() => {
              setSelectedCategory(cat.value);
              setPage(1);
            }}
            className={`chip ${selectedCategory === cat.value ? "bg-primary text-white" : ""}`}
          >
            {cat.label}
          </button>
        ))}
      </div>
      {!onAttach && !query && page === 1 && Boolean(catalog?.recent.length) && (
        <section className="space-y-2">
          <h3 className="font-bold text-sm">مصادر درستها مؤخرًا</h3>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {catalog?.recent.map((resource) => (
              <button
                key={resource.id}
                className="chip max-w-[240px]"
                disabled={Boolean(busy) || !resource.subjectId}
                onClick={() => openStudyPack(resource)}
              >
                <BookMarked className="size-4 shrink-0" />
                <span className="truncate">{resource.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {error ? (
        <div role="alert" className="surface space-y-3 text-red-600">
          <p>{error}</p>
          <button
            className="btn-primary"
            onClick={() => setRetry((v) => v + 1)}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : loading ? (
        <div role="status" className="py-12 text-center">
          <RefreshCw className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-3 text-sm">جارٍ تحميل المكتبة...</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {displayed.map((res) => (
              <article key={res.id} className="surface space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold leading-7 break-words">
                      {res.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {res.subjectName} · {categoryLabel(res.category)} ·{" "}
                      {res.pageCount} صفحة
                    </p>
                  </div>
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => toggleFavorite(res.id)}
                    aria-label={
                      res.favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"
                    }
                    className={`min-h-11 min-w-11 ${res.favorite ? "text-amber-500" : "text-slate-400"}`}
                  >
                    <Star
                      className={`mx-auto size-5 ${res.favorite ? "fill-current" : ""}`}
                    />
                  </button>
                </div>
                {res.description && (
                  <p className="text-sm text-slate-500 leading-6">
                    {res.description}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    className="chip"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run(res.id, () =>
                        openAuthenticatedFile(
                          `/api/library/${res.id}/file?mode=preview`,
                          res.title,
                        ),
                      )
                    }
                  >
                    <Eye className="size-4" />
                    معاينة
                  </button>
                  <button
                    className="chip"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      run(res.id, () =>
                        openAuthenticatedFile(
                          `/api/library/${res.id}/file?mode=download`,
                          res.title,
                          true,
                        ),
                      )
                    }
                  >
                    <Download className="size-4" />
                    تنزيل
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn-secondary"
                    disabled={Boolean(busy) || !res.subjectId}
                    onClick={() => openStudyPack(res)}
                  >
                    <Sparkles className="size-4" />
                    حزمة الدراسة
                  </button>
                  <button
                    className="btn-primary"
                    disabled={Boolean(busy)}
                    onClick={() => attach(res)}
                  >
                    <MessageSquare className="size-4" />
                    {onAttach ? "إرفاق للمحادثة" : "ادرس مع المعلم"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!displayed.length && (
            <p className="surface text-center text-sm text-slate-500">
              لا توجد مصادر مطابقة. جرّب تغيير المرشحات أو الانتقال للصفحة
              التالية.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              className="btn-secondary"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              السابق
            </button>
            <span className="text-xs">الصفحة {page}</span>
            <button
              className="btn-secondary"
              disabled={!catalog || page * catalog.pageSize >= catalog.total}
              onClick={() => setPage((v) => v + 1)}
            >
              التالي
            </button>
          </div>
        </>
      )}
    </div>
  );
}
