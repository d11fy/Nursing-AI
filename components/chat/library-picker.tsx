"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Download, Eye, FileText, FlaskConical, GraduationCap, Library, ListChecks, Loader2, NotebookTabs, Search, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RESOURCE_CATEGORIES, categoryLabel, type ActiveLibrarySource, type LibraryCatalog, type LibraryResource, type ResourceCategory } from "@/lib/library-types";

function CategoryIcon({ category, className = "size-5" }: { category: ResourceCategory; className?: string }) {
  const Icon = category === "curriculum_book" ? BookOpen
    : category === "university_lecture" ? GraduationCap
    : category === "previous_exam" || category === "exam_model" ? FileText
    : category === "question_bank" ? ListChecks
    : category === "lab_material" ? FlaskConical
    : NotebookTabs;
  return <Icon className={className} />;
}

export function ActiveSourceChips({ conversationId, sources, onChange, disabled }: {
  conversationId: string | null;
  sources: ActiveLibrarySource[];
  onChange: (sources: ActiveLibrarySource[]) => void;
  disabled?: boolean;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  if (!sources.length) return null;
  async function remove(source: ActiveLibrarySource) {
    if (!conversationId) return;
    setRemoving(source.id);
    try {
      const response = await fetch("/api/library/sources", { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, documentId: source.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onChange(sources.filter((item) => item.id !== source.id));
      toast.success("تمت إزالة المصدر من سياق المحادثة");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إزالة المصدر"); }
    finally { setRemoving(null); }
  }
  return <div className="mb-2 rounded-xl border border-primary/15 bg-accent/45 p-2.5">
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-primary"><Library className="size-3.5" />المصادر النشطة <span className="font-normal text-muted-foreground">{sources.length}/5</span></p>
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {sources.map(source=><span key={source.id} className="inline-flex min-h-9 max-w-[240px] shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-2.5 text-xs shadow-xs">
        <CategoryIcon category={source.category} className="size-3.5 shrink-0 text-primary" /><span className="truncate font-medium">{source.title}</span>
        <button type="button" disabled={disabled||removing===source.id} onClick={()=>remove(source)} aria-label={`إزالة ${source.title}`} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
          {removing===source.id?<Loader2 className="size-3.5 animate-spin"/>:<X className="size-3.5"/>}
        </button>
      </span>)}
    </div>
  </div>;
}

function ResourceCard({ resource, active, busy, favoriteBusy, studyBusy, onAttach, onFavorite, onStudy }: {
  resource: LibraryResource;
  active: boolean;
  busy: boolean;
  favoriteBusy: boolean;
  studyBusy: boolean;
  onAttach: (resource: LibraryResource) => void;
  onFavorite: (resource: LibraryResource) => void;
  onStudy: (resource: LibraryResource) => void;
}) {
  return <article className="flex min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs">
    <span className="icon-tile size-11 shrink-0"><CategoryIcon category={resource.category}/></span>
    <div className="min-w-0 flex-1 basis-48">
      <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-sm font-bold leading-6">{resource.title}</h3><span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-primary">{categoryLabel(resource.category)}</span></div>
      <p className="mt-0.5 text-xs text-muted-foreground">{[resource.subjectName,resource.pageCount?`${resource.pageCount} صفحة`:null,resource.sourceLabel].filter(Boolean).join(" · ")}</p>
      {resource.description&&<p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{resource.description}</p>}
    </div>
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
      <Button type="button" size="icon-sm" variant="ghost" disabled={favoriteBusy} onClick={()=>onFavorite(resource)} aria-label={resource.favorite?`إزالة ${resource.title} من المفضلة`:`إضافة ${resource.title} إلى المفضلة`} title="المفضلة">
        {favoriteBusy?<Loader2 className="animate-spin"/>:<Star className={resource.favorite?"fill-current text-amber-500":""}/>} 
      </Button>
      <Button size="icon-sm" variant="ghost" render={<a href={`/api/library/${resource.id}/file?mode=preview`} target="_blank" rel="noreferrer" aria-label={`معاينة ${resource.title}`} title="معاينة"/>}><Eye/></Button>
      <Button size="icon-sm" variant="ghost" render={<a href={`/api/library/${resource.id}/file?mode=download`} aria-label={`تنزيل ${resource.title}`} title="تنزيل"/>}><Download/></Button>
      <Button type="button" size="sm" variant="outline" disabled={studyBusy||!resource.subjectId} onClick={()=>onStudy(resource)} title={resource.subjectId?"فتح حزمة الدراسة":"المصدر غير مرتبط بمادة"}>
        {studyBusy?<Loader2 className="animate-spin"/>:<Sparkles/>}<span className="hidden sm:inline">Study Pack</span>
      </Button>
      <Button type="button" size="sm" variant={active?"secondary":"default"} disabled={busy||active} onClick={()=>onAttach(resource)} className="shrink-0">
        {busy?<Loader2 className="animate-spin"/>:active?"مضاف":"إضافة"}
      </Button>
    </div>
  </article>;
}

export function LibraryPicker({ conversationId, subjectId, activeSources, onSourcesChange, onConversationCreated, disabled }: {
  conversationId: string | null;
  subjectId?: string | null;
  activeSources: ActiveLibrarySource[];
  onSourcesChange: (sources: ActiveLibrarySource[]) => void;
  onConversationCreated: (conversationId: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open,setOpen]=useState(false),[catalog,setCatalog]=useState<LibraryCatalog|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
  const [selectedSubject,setSelectedSubject]=useState(subjectId??""),[selectedCategory,setSelectedCategory]=useState<ResourceCategory|null>(null),[semester,setSemester]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(1),[retry,setRetry]=useState(0),[attaching,setAttaching]=useState<string|null>(null),[favoriteBusy,setFavoriteBusy]=useState<string|null>(null),[studyBusy,setStudyBusy]=useState<string|null>(null);
  const activeIds=useMemo(()=>new Set(activeSources.map(source=>source.id)),[activeSources]);

  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{setLoading(true);setError(false);try{
      const params=new URLSearchParams({page:String(page),pageSize:"18"});
      if(selectedSubject)params.set("subjectId",selectedSubject);if(selectedCategory)params.set("category",selectedCategory);if(semester)params.set("semester",semester);if(query.trim())params.set("q",query.trim());
      const response=await fetch(`/api/library?${params}`,{signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);setCatalog(data);
    }catch(error){if((error as Error).name!=="AbortError")setError(true);}finally{if(!controller.signal.aborted)setLoading(false);}},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[open,selectedSubject,selectedCategory,semester,query,page,retry]);

  async function attach(resource:LibraryResource){setAttaching(resource.id);try{
    const response=await fetch("/api/library/sources",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId,documentId:resource.id,subjectId:subjectId??resource.subjectId})});
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    onSourcesChange([...activeSources.filter(source=>source.id!==data.source.id),data.source]);if(data.conversationId!==conversationId)onConversationCreated(data.conversationId);
    toast.success("تمت إضافة الملف للمحادثة");setOpen(false);
  }catch(error){toast.error(error instanceof Error?error.message:"تعذر إضافة المصدر");}finally{setAttaching(null);}}

  async function toggleFavorite(resource:LibraryResource){setFavoriteBusy(resource.id);try{
    const favorite=!resource.favorite;const response=await fetch("/api/library/favorites",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:resource.id,favorite})});
    const data=await response.json();if(!response.ok)throw new Error(data.error);
    setCatalog(current=>current?{...current,resources:current.resources.map(item=>item.id===resource.id?{...item,favorite}:item),recent:current.recent.map(item=>item.id===resource.id?{...item,favorite}:item)}:current);
    toast.success(favorite?"أُضيف المصدر إلى المفضلة":"أُزيل المصدر من المفضلة");
  }catch(error){toast.error(error instanceof Error?error.message:"تعذر تحديث المفضلة");}finally{setFavoriteBusy(null);}}

  async function openStudyPack(resource:LibraryResource){setStudyBusy(resource.id);try{
    const response=await fetch(`/api/library/${resource.id}/study-pack`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error);
    setOpen(false);router.push(data.url);
  }catch(error){toast.error(error instanceof Error?error.message:"تعذر فتح حزمة الدراسة");}finally{setStudyBusy(null);}}

  const card=(resource:LibraryResource)=><ResourceCard key={resource.id} resource={resource} active={activeIds.has(resource.id)} busy={attaching===resource.id} favoriteBusy={favoriteBusy===resource.id} studyBusy={studyBusy===resource.id} onAttach={attach} onFavorite={toggleFavorite} onStudy={openStudyPack}/>;
  const favorites=catalog?.resources.filter(resource=>resource.favorite)??[];

  const showFiles=Boolean(query.trim()||selectedCategory);
  return <Sheet open={open} onOpenChange={next=>{if(next&&subjectId)setSelectedSubject(subjectId);setOpen(next);}}>
    <SheetTrigger render={<Button type="button" variant="ghost" size="sm" disabled={disabled} className="text-primary hover:text-primary"/>}><Library className="size-4"/>المكتبة</SheetTrigger>
    <SheetContent side="bottom" className="mx-auto h-[92dvh] max-h-[820px] w-full max-w-5xl gap-0 rounded-t-3xl border-x p-0" dir="rtl">
      <SheetHeader className="shrink-0 border-b px-4 pb-4 pt-5 sm:px-6"><SheetTitle className="flex items-center gap-2 text-lg"><span className="icon-tile size-10"><Library className="size-5"/></span>المكتبة الدراسية</SheetTitle><SheetDescription>{catalog?.academicYear?.name??"مصادر جاهزة ومعتمدة لمساقاتك"}</SheetDescription></SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 space-y-3 border-b bg-card/70 p-4 sm:px-6">
          <div className="relative"><Search className="absolute right-3 top-3.5 size-4 text-muted-foreground"/><Input value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} placeholder="ابحث بالعنوان، المادة، التصنيف أو الوصف" className="pe-10"/></div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {catalog?.subjects.map(subject=><button key={subject.id} type="button" onClick={()=>{setSelectedSubject(subject.id);setSelectedCategory(null);setPage(1);}} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold ${selectedSubject===subject.id?"border-primary bg-accent text-primary":"bg-card text-muted-foreground"}`}>{subject.name}<span className="ms-1 font-normal">{subject.count}</span></button>)}
          </div>
          <div className="flex items-center gap-2"><select value={semester} onChange={event=>{setSemester(event.target.value);setPage(1);}} className="h-10 rounded-xl border bg-background px-3 text-xs"><option value="">كل الفصول</option><option value="1">الفصل الأول</option><option value="2">الفصل الثاني</option></select>{(selectedCategory||query)&&<button type="button" onClick={()=>{setSelectedCategory(null);setQuery("");setPage(1);}} className="text-xs font-bold text-primary">عرض التصنيفات</button>}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background p-4 sm:p-6">
          {loading&&!catalog?<div className="grid gap-3 sm:grid-cols-2">{Array.from({length:6},(_,index)=><div key={index} className="h-28 animate-pulse rounded-2xl border bg-muted"/>)}</div>
          :error?<div className="flex min-h-52 flex-col items-center justify-center text-center"><p className="font-bold">تعذر تحميل المكتبة حاليًا.</p><Button variant="outline" className="mt-3" onClick={()=>setRetry(value=>value+1)}>حاول مرة أخرى</Button></div>
          :!showFiles?<div className="space-y-6">
            {favorites.length?<section><h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Star className="size-4 fill-current text-amber-500"/>المفضلة</h2><div className="grid gap-3 sm:grid-cols-2">{favorites.slice(0,4).map(card)}</div></section>:null}
            {catalog?.recent.length?<section><h2 className="mb-3 text-sm font-bold">استخدمتها مؤخرًا</h2><div className="grid gap-3 sm:grid-cols-2">{catalog.recent.map(card)}</div></section>:null}
            <section><h2 className="mb-3 text-sm font-bold">اختر نوع المصدر</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{RESOURCE_CATEGORIES.map(category=>{const count=catalog?.categoryCounts[category.value]??0;return <button key={category.value} type="button" disabled={!count} onClick={()=>{setSelectedCategory(category.value);setPage(1);}} className="min-h-28 rounded-2xl border bg-card p-3 text-start shadow-xs transition hover:border-primary/40 hover:bg-accent/30 disabled:opacity-45"><CategoryIcon category={category.value} className="mb-3 size-6 text-primary"/><span className="block text-sm font-bold">{category.label}</span><span className="mt-1 block text-xs text-muted-foreground">{count} ملفات</span></button>})}</div></section>
          </div>
          :catalog?.resources.length?<div className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">{selectedCategory?categoryLabel(selectedCategory):"نتائج البحث"}</h2><span className="text-xs text-muted-foreground">{catalog.total} مصدر</span></div><div className="grid gap-3 lg:grid-cols-2">{catalog.resources.map(card)}</div><div className="flex gap-2">{catalog.page>1&&<Button variant="outline" className="flex-1" onClick={()=>setPage(value=>value-1)}>السابق</Button>}{catalog.total>catalog.page*catalog.pageSize&&<Button variant="outline" className="flex-1" onClick={()=>setPage(value=>value+1)}>التالي</Button>}</div></div>
          :<div className="flex min-h-52 items-center justify-center text-center text-sm text-muted-foreground">{query?"لم نجد ملفًا مطابقًا لبحثك.":"لا توجد مصادر متاحة هنا حاليًا."}</div>}
        </div>
      </div>
    </SheetContent>
  </Sheet>;
}
