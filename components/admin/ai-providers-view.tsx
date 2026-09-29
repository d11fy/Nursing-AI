"use client";

import { useState, useEffect } from "react";
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Shield,
  RefreshCw,
  Send,
  DollarSign,
  Activity,
  Layers,
  Sparkles,
  Sliders,
  Terminal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ProviderStat {
  requestsToday: number;
  tokensToday: number;
  costToday: number;
  errorsToday: number;
  avgLatencyMs: number;
  fallbackRequests: number;
  status: string;
  model: string;
  role: string;
}

interface StatusData {
  providerStats: Record<string, ProviderStat>;
  totals: {
    requestsToday: number;
    premiumRequests: number;
    economyRequests: number;
    freeTierRequests: number;
    costToday: number;
    costMonth: number;
    openaiCostMonth: number;
    monthlyAiBudget: number;
    openaiMonthlyBudget: number;
    featureCosts: Record<string, number>;
  };
  settings: {
    primaryProvider: string;
    economyProvider: string;
    fastProvider: string;
    utilityProvider: string;
    fallbackEnabled: boolean;
    allowFreeTierPrivateContent: boolean;
    monthlyAiBudget: number;
    openaiMonthlyBudget: number;
  };
}

export function AIProvidersView() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Health tests state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: string; latency?: number; model?: string; error?: string }>>({});

  // Manual debug prompt state
  const [debugProvider, setDebugProvider] = useState<string>("gemini");
  const [debugQuestion, setDebugQuestion] = useState<string>("ما هي علامات الصدمة الإنتانية وفق المنهج؟");
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResponse, setDebugResponse] = useState<any>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    primaryProvider: "openai",
    economyProvider: "gemini",
    fastProvider: "groq",
    utilityProvider: "cloudflare",
    fallbackEnabled: true,
    allowFreeTierPrivateContent: false,
    monthlyAiBudget: 50,
    openaiMonthlyBudget: 30,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/ai-providers/status");
      if (!res.ok) throw new Error("تعذر جلب بيانات المزودات");
      const json: StatusData = await res.json();
      setData(json);
      setSettingsForm(json.settings);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider);
    try {
      const res = await fetch("/api/admin/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health", provider }),
      });
      const json = await res.json();
      if (json.status === "healthy") {
        setTestResults((prev) => ({
          ...prev,
          [provider]: { status: "healthy", latency: json.latencyMs, model: json.model },
        }));
        toast.success(`تم الاتصال بنجاح بـ ${provider} (${json.latencyMs}ms)`);
      } else {
        setTestResults((prev) => ({
          ...prev,
          [provider]: { status: json.status, error: json.lastError },
        }));
        toast.error(`فشل الاتصال بـ ${provider}: ${json.lastError || "غير متاح"}`);
      }
    } catch {
      toast.error(`تعذر إجراء الفحص لـ ${provider}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai-providers/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      if (!res.ok) throw new Error("تعذر حفظ الإعدادات");
      toast.success("تم حفظ إعدادات الـ AI Router بنجاح");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const handleRunManualTest = async () => {
    if (!debugQuestion.trim()) {
      toast.error("يرجى إدخال سؤال للتجربة");
      return;
    }
    setDebugLoading(true);
    setDebugResponse(null);
    try {
      const res = await fetch("/api/admin/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_test",
          provider: debugProvider,
          question: debugQuestion,
        }),
      });
      const json = await res.json();
      setDebugResponse(json);
      if (json.success) {
        toast.success(`تم استلام الرد من ${debugProvider} في ${json.latencyMs}ms`);
      } else {
        toast.error(`خطأ: ${json.error || "فشل تنفيذ الطلب"}`);
      }
    } catch {
      toast.error("حدث خطأ أثناء إرسال التجربة");
    } finally {
      setDebugLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const totals = data?.totals ?? {
    requestsToday: 0,
    premiumRequests: 0,
    economyRequests: 0,
    freeTierRequests: 0,
    costToday: 0,
    costMonth: 0,
    openaiCostMonth: 0,
    monthlyAiBudget: 50,
    openaiMonthlyBudget: 30,
    featureCosts: {},
  };

  const budgetRatio = totals.monthlyAiBudget > 0 ? (totals.costMonth / totals.monthlyAiBudget) * 100 : 0;
  const isBudgetWarning = budgetRatio >= 80;

  const providerCards = [
    {
      id: "openai",
      name: "OpenAI",
      titleAr: "أوبن إيه آي",
      roleBadge: "Primary / Clinical",
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
      description: "المزود الأساسي للمهام السريرية المعقدة، والتحليل الطبي الدقيق، والرؤية البصرية (Vision).",
    },
    {
      id: "gemini",
      name: "Google Gemini",
      titleAr: "جوجل جيميناي",
      roleBadge: "Backup / Economy",
      badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
      description: "مزود اقتصادي واحتياطي عالي الكفاءة للأسئلة العادية، والتلخيص، والـ Flashcards، والـ Quizzes.",
    },
    {
      id: "groq",
      name: "Groq LPU",
      titleAr: "جروك فاست",
      roleBadge: "Fast Backup",
      badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
      description: "مزود سريع جدًا بسرعة استجابة فائقة للمهام النصية البسيطة والنسخ الاحتياطي السريع.",
    },
    {
      id: "cloudflare",
      name: "Cloudflare Workers AI",
      titleAr: "كلاودفلير",
      roleBadge: "Utility / Classifier",
      badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
      description: "مزود المهام المساندة والتصنيف (Scope, Topic, Intent, Complexity) دون توليد إجابات أكاديمية.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Cpu className="h-6 w-6 text-teal-600" />
            مزودات الذكاء الاصطناعي (AI Providers & Smart Router)
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            إدارة وتوجيه الطلبات الذكية بين OpenAI و Gemini و Groq و Cloudflare مع حماية صارمة لمنهج التمريض.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 self-start sm:self-auto">
          <RefreshCw className="h-4 w-4" />
          تحديث البيانات
        </Button>
      </div>

      {/* Budget Warning Banner if >= 80% */}
      {isBudgetWarning && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <span className="font-bold">تنبيه الميزانية (Budget Guard):</span> تم استهلاك {budgetRatio.toFixed(1)}% من الميزانية الشهرية. يقوم الـ Router تلقائيًا بتوجيه المزيد من الأسئلة العادية والبسيطة إلى المزود الاقتصادي (Gemini / Groq) لتوفير التكلفة.
          </div>
        </div>
      )}

      {/* Overview Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">طلبات اليوم</CardTitle>
            <Activity className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.requestsToday}</div>
            <p className="mt-1 text-xs text-slate-400">
              {totals.premiumRequests} متميز (OpenAI) • {totals.economyRequests} اقتصادي
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">تكلفة اليوم</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totals.costToday.toFixed(4)}</div>
            <p className="mt-1 text-xs text-slate-400">استهلاك اليوم لكافة المزودات</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">استهلاك الشهر الحالي</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totals.costMonth.toFixed(2)}</div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-1.5 rounded-full ${budgetRatio > 90 ? "bg-red-500" : budgetRatio > 70 ? "bg-amber-500" : "bg-teal-500"}`}
                style={{ width: `${Math.min(100, budgetRatio)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              من أصل ميزانية ${totals.monthlyAiBudget} ({budgetRatio.toFixed(0)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">استخدام الـ Economy & Free</CardTitle>
            <Zap className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.requestsToday > 0 ? ((totals.economyRequests / totals.requestsToday) * 100).toFixed(0) : 0}%
            </div>
            <p className="mt-1 text-xs text-slate-400">نسبة الطلبات المحولة لمزودات التوفير</p>
          </CardContent>
        </Card>
      </div>

      {/* 4 Provider Cards */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">المزودات المفعلة (Active Providers)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {providerCards.map((p) => {
            const stat = data?.providerStats?.[p.id] || {
              requestsToday: 0,
              tokensToday: 0,
              costToday: 0,
              errorsToday: 0,
              avgLatencyMs: 0,
              fallbackRequests: 0,
              status: "healthy",
              model: "",
              role: "",
            };

            const testResult = testResults[p.id];
            const isTesting = testingProvider === p.id;

            return (
              <Card key={p.id} className="relative overflow-hidden border border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold">{p.name}</CardTitle>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.badgeColor}`}>
                          {p.roleBadge}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{p.description}</p>
                    </div>
                    {/* Status Pill */}
                    <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-800">
                      {stat.status === "healthy" ? (
                        <>
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="text-emerald-700 dark:text-emerald-400">جاهز (Healthy)</span>
                        </>
                      ) : stat.status === "rate_limited" ? (
                        <>
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          <span className="text-amber-700 dark:text-amber-400">Rate Limited</span>
                        </>
                      ) : stat.status === "degraded" ? (
                        <>
                          <span className="h-2 w-2 rounded-full bg-yellow-500" />
                          <span className="text-yellow-700 dark:text-yellow-400">Degraded</span>
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          <span className="text-red-700 dark:text-red-400">غير متصل</span>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Model & Key info */}
                  <div className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-900/60">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>النموذج المعتمد:</span>
                      <code className="font-mono font-semibold text-slate-900 dark:text-white">{stat.model}</code>
                    </div>
                  </div>

                  {/* Today's Numbers */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded border border-slate-100 p-2 dark:border-slate-800">
                      <div className="text-xs text-slate-400">الطلبات</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{stat.requestsToday}</div>
                    </div>
                    <div className="rounded border border-slate-100 p-2 dark:border-slate-800">
                      <div className="text-xs text-slate-400">Tokens</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {stat.tokensToday > 1000 ? `${(stat.tokensToday / 1000).toFixed(1)}k` : stat.tokensToday}
                      </div>
                    </div>
                    <div className="rounded border border-slate-100 p-2 dark:border-slate-800">
                      <div className="text-xs text-slate-400">الاستجابة</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {stat.avgLatencyMs ? `${stat.avgLatencyMs}ms` : "-"}
                      </div>
                    </div>
                    <div className="rounded border border-slate-100 p-2 dark:border-slate-800">
                      <div className="text-xs text-slate-400">التكلفة</div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        ${stat.costToday.toFixed(3)}
                      </div>
                    </div>
                  </div>

                  {/* Test Connection Button & Result */}
                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTesting}
                      onClick={() => handleTestConnection(p.id)}
                      className="w-full gap-2 text-xs"
                    >
                      {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                      اختبار الاتصال بالسيرفر
                    </Button>

                    {testResult && (
                      <div
                        className={`flex items-center gap-2 rounded p-2 text-xs ${
                          testResult.status === "healthy"
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                        }`}
                      >
                        {testResult.status === "healthy" ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span>متصل بنجاح ✓ | الاستجابة: {testResult.latency}ms | الموديل: {testResult.model}</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span>فشل الاتصال: {testResult.error || "خطأ غير معروف"}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Router Configuration & Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Sliders className="h-5 w-5 text-teal-600" />
            إعدادات التوجيه الذكي (AI Router & Budget Settings)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Primary & Fallback Providers */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  المزود الأساسي العام (Primary Provider)
                </label>
                <select
                  value={settingsForm.primaryProvider}
                  onChange={(e) => setSettingsForm({ ...settingsForm, primaryProvider: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="openai">OpenAI (موصى به للمهام عالية الدقة)</option>
                  <option value="gemini">Google Gemini (للتوفير الاقتصادي)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  المزود الاقتصادي (Economy Provider للأسئلة العادية والتلخيص)
                </label>
                <select
                  value={settingsForm.economyProvider}
                  onChange={(e) => setSettingsForm({ ...settingsForm, economyProvider: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="gemini">Google Gemini (الأمثل للأسئلة البسيطة والبطاقات)</option>
                  <option value="groq">Groq (سرعة استجابة فائقة)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  المزود السريع الاحتياطي (Fast Provider)
                </label>
                <select
                  value={settingsForm.fastProvider}
                  onChange={(e) => setSettingsForm({ ...settingsForm, fastProvider: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="groq">Groq (LPU Inference)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
            </div>

            {/* Budget & Privacy Guards */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  الميزانية الشهرية الإجمالية ($ USD)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1000"
                  value={settingsForm.monthlyAiBudget}
                  onChange={(e) => setSettingsForm({ ...settingsForm, monthlyAiBudget: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <p className="mt-1 text-xs text-slate-400">عند الوصول لـ 80% يتم التحويل التلقائي لنمط التوفير الاقتصادي.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  سقف ميزانية OpenAI الشهرية ($ USD)
                </label>
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={settingsForm.openaiMonthlyBudget}
                  onChange={(e) => setSettingsForm({ ...settingsForm, openaiMonthlyBudget: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div className="pt-2 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.fallbackEnabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, fallbackEnabled: e.target.checked })}
                    className="h-4 w-4 rounded text-teal-600"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    تفعيل التبديل التلقائي الاحتياطي (Fallback Enabled عند 429 أو انقطاع الخدمة)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.allowFreeTierPrivateContent}
                    onChange={(e) => setSettingsForm({ ...settingsForm, allowFreeTierPrivateContent: e.target.checked })}
                    className="h-4 w-4 rounded text-teal-600"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    السماح بإرسال ملفات ومحاضرات الطلاب الخاصة إلى مزودي الـ Free Tier
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button onClick={handleSaveSettings} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
              {saving ? "جاري الحفظ..." : "حفظ إعدادات التوجيه"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Debug Console (Admin Only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Terminal className="h-5 w-5 text-indigo-600" />
            منصة الفحص المباشر (Admin AI Debug Console)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">اختر المزود للتجربة</label>
              <select
                value={debugProvider}
                onChange={(e) => setDebugProvider(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="cloudflare">Cloudflare Workers AI</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">نص السؤال التجريبي</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={debugQuestion}
                  onChange={(e) => setDebugQuestion(e.target.value)}
                  placeholder="اكتب سؤالًا لاختبار استجابة المزود..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <Button
                  onClick={handleRunManualTest}
                  disabled={debugLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                >
                  {debugLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  إرسال
                </Button>
              </div>
            </div>
          </div>

          {debugResponse && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  النتيجة من {debugResponse.provider} ({debugResponse.model}):
                </span>
                <span>زمن الاستجابة: {debugResponse.latencyMs}ms</span>
              </div>
              {debugResponse.success ? (
                <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">
                  {debugResponse.content}
                </div>
              ) : (
                <div className="text-sm text-red-600 dark:text-red-400">
                  خطأ: {debugResponse.error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
