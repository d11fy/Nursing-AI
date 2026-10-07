import React, { useEffect, useState } from "react";
import { CreditCard, RefreshCw, CheckCircle2 } from "lucide-react";
import { apiFetch, apiUpload } from "../services/api";
import { openAuthenticatedFile } from "../services/files";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import type {
  SubscriptionAccess,
  UsageItem,
} from "../../../lib/subscriptions/types";
interface SubscriptionData {
  access: SubscriptionAccess;
  usage: UsageItem[];
  plans: {
    id: string;
    name: string;
    price: number;
    currency: string;
    duration_days: number;
    description: string;
    recommended: boolean;
  }[];
  methods: {
    id: string;
    name: string;
    type: string;
    account_holder: string | null;
    account_number: string | null;
    iban: string | null;
    wallet_number: string | null;
    instructions: string;
  }[];
  payments: {
    id: string;
    payment_reference: string;
    plan_name_snapshot: string;
    status: string;
    rejection_reason: string | null;
    created_at: string;
  }[];
  history: {
    id: string;
    plan_name_snapshot: string;
    starts_at: string;
    ends_at: string;
  }[];
}
const labels: Record<string, string> = {
  ai_questions_daily: "أسئلة المعلم اليوم",
  images_limit: "الصور",
  files_limit: "الملفات",
  study_pack_limit: "حزم الدراسة",
  quiz_limit: "الاختبارات",
};
const statuses: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغي",
};
export function SubscriptionScreen() {
  const { refreshAuth } = useAuth();
  const { showToast } = useNavigation();
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<SubscriptionData>("/api/subscription");
      setData(res);
      setMethodId((v) => v || res.methods[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل الاشتراك");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receipt || !planId || !methodId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.set("planId", planId);
      form.set("methodId", methodId);
      form.set("receipt", receipt);
      const result = await apiUpload<{ reference: string }>(
        "/api/subscription/payments",
        form,
      );
      setReference(result.reference);
      setReceipt(null);
      setPlanId("");
      await Promise.all([load(), refreshAuth()]);
      showToast("تم إرسال إثبات الدفع للمراجعة");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الإيصال");
    } finally {
      setSubmitting(false);
    }
  };
  const date = (value: string) => new Date(value).toLocaleDateString("ar-EG");
  if (loading && !data)
    return (
      <div role="status" className="py-20 text-center">
        <RefreshCw className="mx-auto size-6 animate-spin text-primary" />
        جارٍ تحميل الاشتراك...
      </div>
    );
  return (
    <div className="space-y-5 pb-nav">
      {error && (
        <div role="alert" className="surface text-red-600 space-y-2">
          <p>{error}</p>
          <button onClick={load} className="btn-secondary">
            إعادة المحاولة
          </button>
        </div>
      )}
      {reference && (
        <div role="status" className="surface bg-teal-50 text-primary">
          تم استلام طلبك. رقم المرجع: <b dir="ltr">{reference}</b>
        </div>
      )}
      {data && (
        <>
          <section className="rounded-3xl bg-primary p-5 text-white space-y-3">
            <CreditCard className="size-7" />
            <h2 className="text-xl font-black">{data.access.planName}</h2>
            <p>
              {data.access.active
                ? `${data.access.daysRemaining} يوم متبقٍ`
                : "انتهى الاشتراك؛ بياناتك السابقة محفوظة"}
            </p>
            {data.access.endsAt && (
              <p className="text-sm text-white/80">
                ينتهي في {date(data.access.endsAt)}
              </p>
            )}
            <button className="chip" disabled={loading} onClick={load}>
              تحديث حالة الاشتراك
            </button>
          </section>
          <section className="surface space-y-4">
            <h3 className="font-bold">استخدام باقتك</h3>
            {data.usage.map((item) => (
              <div key={item.key} className="space-y-2">
                <div className="flex justify-between gap-2 text-sm">
                  <span>{labels[item.key] || item.key}</span>
                  <b>
                    {item.used} / {item.limit}
                  </b>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${item.limit ? Math.min(100, (item.used / item.limit) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="font-black">الباقات المتاحة</h3>
            {data.plans.map((plan) => (
              <article
                key={plan.id}
                className={`surface space-y-3 ${plan.recommended ? "border-primary" : ""}`}
              >
                <div className="flex justify-between gap-2">
                  <h4 className="font-bold">{plan.name}</h4>
                  {plan.recommended && (
                    <span className="text-xs text-primary">موصى بها</span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{plan.description}</p>
                <p className="text-2xl font-black">
                  {plan.price}{" "}
                  <span className="text-sm">
                    {plan.currency} / {plan.duration_days} يومًا
                  </span>
                </p>
                <p className="flex gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-primary" />
                  حفظ بياناتك وسجل دراستك
                </p>
                <button
                  className="btn-primary w-full"
                  disabled={!data.methods.length || submitting}
                  onClick={() => {
                    setPlanId(plan.id);
                    setReceipt(null);
                    document
                      .getElementById("payment-form")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {planId === plan.id
                    ? "تم اختيار الباقة"
                    : "اختيار الباقة وإرسال الدفع"}
                </button>
              </article>
            ))}
          </section>
          <section className="space-y-3">
            <h3 className="font-black">طرق الدفع</h3>
            {data.methods.map((method) => (
              <div key={method.id} className="surface space-y-2">
                <b>{method.name}</b>
                <p className="text-sm">{method.account_holder}</p>
                <p dir="ltr" className="selectable-text text-sm break-all">
                  {method.account_number || method.wallet_number || method.iban}
                </p>
                <p className="text-sm text-slate-500 leading-6">
                  {method.instructions}
                </p>
              </div>
            ))}
            {!data.methods.length && (
              <p className="surface text-sm">لا توجد طريقة دفع متاحة حاليًا.</p>
            )}
          </section>
          <form
            id="payment-form"
            onSubmit={submit}
            className="surface space-y-3"
          >
            <h3 className="font-bold">إرسال إثبات الدفع</h3>
            <label className="block text-sm">
              الباقة
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="field w-full mt-1"
                required
              >
                <option value="">اختر الباقة</option>
                {data.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.price} {p.currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              طريقة الدفع
              <select
                value={methodId}
                onChange={(e) => setMethodId(e.target.value)}
                className="field w-full mt-1"
                required
              >
                {data.methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              صورة أو PDF للإيصال
              <input
                key={reference}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] || null)}
                className="field w-full py-2 mt-1"
                required
              />
            </label>
            <button
              className="btn-primary w-full"
              disabled={submitting || !receipt || !planId || !methodId}
            >
              {submitting ? "جارٍ إرسال الإيصال..." : "إرسال الطلب للمراجعة"}
            </button>
            <p className="text-xs text-slate-500">
              يُفعّل الاشتراك بعد مراجعة الدفع. التجديد يحافظ على الأيام
              المتبقية.
            </p>
          </form>
          <section className="space-y-3">
            <h3 className="font-bold">طلبات الدفع</h3>
            {data.payments.map((p) => (
              <article key={p.id} className="surface space-y-2">
                <b>{p.plan_name_snapshot}</b>
                <p className="text-sm">
                  {statuses[p.status] || p.status} · {date(p.created_at)}
                </p>
                <p className="text-xs" dir="ltr">
                  {p.payment_reference}
                </p>
                {p.rejection_reason && (
                  <p className="text-red-600 text-sm">{p.rejection_reason}</p>
                )}
                <button
                  className="btn-secondary"
                  onClick={() =>
                    openAuthenticatedFile(
                      `/api/subscription/receipts/${p.id}`,
                      "receipt.pdf",
                    ).catch((e) => showToast(e.message))
                  }
                >
                  عرض الإيصال
                </button>
              </article>
            ))}
            {!data.payments.length && (
              <p className="text-sm text-slate-500">لا توجد طلبات دفع بعد.</p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-bold">سجل الاشتراكات</h3>
            {data.history.map((h) => (
              <div key={h.id} className="surface">
                <b>{h.plan_name_snapshot}</b>
                <p className="text-sm text-slate-500 mt-2">
                  {date(h.starts_at)} — {date(h.ends_at)}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
