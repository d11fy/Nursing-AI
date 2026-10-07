import React, { useEffect, useState } from "react";
import {
  MessageSquare,
  BookOpen,
  History,
  TrendingUp,
  CircleAlert,
  Gauge,
  ArrowLeft,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import { apiFetch } from "../services/api";

interface RecentConversation {
  id: string;
  title: string;
  updated_at: string;
}

interface WeakTopic {
  subjectId: string;
  topicKey: string;
  topicName: string;
  subjectName: string;
  masteryScore: number;
}

export function HomeScreen() {
  const { profile, access, aiUsage, refreshAuth } = useAuth();
  const { navigate, switchTab } = useNavigation();

  const [recentConversations, setRecentConversations] = useState<
    RecentConversation[]
  >([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [, res, progress] = await Promise.all([
        refreshAuth(),
        apiFetch("/api/conversations"),
        apiFetch<{ weakTopics?: WeakTopic[] }>("/api/learning-progress").catch(
          () => ({ weakTopics: [] }),
        ),
      ]);
      if (res.conversations) {
        setRecentConversations(res.conversations.slice(0, 5));
      }
      setWeakTopics((progress.weakTopics ?? []).slice(0, 2));
    } catch {
      // Individual screens provide their own retry path when a request fails.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // The initial hydration intentionally runs only when this screen mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] || "طالب التمريض";
  const used = aiUsage?.used ?? 0;
  const limit = aiUsage?.limit ?? 10;
  const percentage = Math.min(
    100,
    Math.round((limit > 0 ? used / limit : 0) * 100),
  );
  const remaining = Math.max(0, limit - used);

  return (
    <div className="space-y-5 pb-nav">
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-linear-to-l from-primary to-teal-800 p-5 text-white shadow-lg shadow-primary/20 relative overflow-hidden">
        <div className="absolute left-[-20px] top-[-20px] size-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold backdrop-blur-md">
              <Sparkles className="size-3 text-teal-200" />
              لوحة الطالب
            </span>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white active:scale-95"
              aria-label="تحديث بيانات الصفحة"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <h2 className="text-xl font-black">مرحبًا، {firstName}</h2>
          <p className="text-xs text-teal-100 leading-relaxed max-w-[280px]">
            تابع دراسة مساقاتك، اختبر معلوماتك، أو استشر المعلم الذكي.
          </p>
        </div>
      </div>

      {weakTopics.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              مواضيع تحتاج مراجعة
            </h3>
            <button
              onClick={() => navigate("progress")}
              className="min-h-11 px-2 text-[11px] font-bold text-primary"
            >
              عرض التقدم
            </button>
          </div>
          <div className="space-y-2">
            {weakTopics.map((topic) => (
              <button
                key={`${topic.subjectId}-${topic.topicKey}`}
                onClick={() => navigate("progress")}
                className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-start dark:border-amber-900/50 dark:bg-amber-950/30"
              >
                <span>
                  <b className="block text-xs text-slate-900 dark:text-white">
                    {topic.topicName}
                  </b>
                  <span className="text-[10px] text-slate-500">
                    {topic.subjectName}
                  </span>
                </span>
                <span className="text-xs font-black text-amber-700 dark:text-amber-400">
                  {topic.masteryScore}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Daily Usage Card */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4.5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-teal-50 text-primary dark:bg-slate-800">
              <Gauge className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                استخدامك اليوم
              </h3>
              <p className="text-[11px] text-slate-500">
                {used} من أصل {limit} سؤال ·{" "}
                {access?.planName || "الخطة التجريبية"}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-teal-50 dark:bg-slate-800 px-3 py-1 text-[11px] font-black text-primary">
            {access?.active !== false ? `${remaining} متبقٍ` : "جدّد الآن"}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <button
        onClick={() => navigate("subscription")}
        className="btn-secondary w-full"
      >
        {access?.active === false ? "تجديد الاشتراك" : "عرض الباقات والاستخدام"}
      </button>

      {/* Quick Actions Grid */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider px-1">
          وصول سريع
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* New Chat */}
          <button
            onClick={() => switchTab("chat")}
            className="flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-97 transition-all text-start"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/60 text-primary mb-3">
              <MessageSquare className="size-5" />
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              محادثة ذكية
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              اسأل المعلم عن أي موضوع
            </span>
          </button>

          {/* Subjects */}
          <button
            onClick={() => switchTab("subjects")}
            className="flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-97 transition-all text-start"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 mb-3">
              <BookOpen className="size-5" />
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              المواد الدراسية
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              تصفح المحاضرات والامتحانات
            </span>
          </button>

          {/* Mistakes */}
          <button
            onClick={() => navigate("mistakes")}
            className="flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-97 transition-all text-start"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 mb-3">
              <CircleAlert className="size-5" />
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              مراجعة أخطائي
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              الأسئلة التي أخطأت بها
            </span>
          </button>

          {/* Learning Progress */}
          <button
            onClick={() => navigate("progress")}
            className="flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-97 transition-all text-start"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 mb-3">
              <TrendingUp className="size-5" />
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              تقدم التعلم
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
              نسبة الإتقان والمواضيع
            </span>
          </button>
        </div>
      </div>

      {/* Recent Chats Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
            آخر المحادثات
          </h3>
          <button
            onClick={() => navigate("chat-history")}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            عرض الكل
          </button>
        </div>

        {recentConversations.length > 0 ? (
          <div className="space-y-2">
            {recentConversations.map((c) => (
              <div
                key={c.id}
                onClick={() =>
                  navigate("chat-detail", { conversationId: c.id })
                }
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs active:scale-98 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <History className="size-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {c.title}
                  </span>
                </div>
                <ArrowLeft className="size-4 shrink-0 text-slate-400" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
            لا توجد محادثات سابقة حتى الآن.
          </div>
        )}
      </div>
    </div>
  );
}
