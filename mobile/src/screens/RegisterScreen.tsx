import React, { useState } from "react";
import {
  Mail,
  Lock,
  User,
  GraduationCap,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import { BrandSymbol } from "../components/common/BrandLogo";

export function RegisterScreen() {
  const { register } = useAuth();
  const { goBack } = useNavigation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [university, setUniversity] = useState("الجامعة الإسلامية بغزة");
  const [nursingYear, setNursingYear] = useState<string>("year1");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim() || !password || !university.trim()) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }

    setLoading(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        university: university.trim(),
        nursingYear,
      });
    } catch (err: any) {
      setError(err.message || "تعذر إنشاء الحساب؛ يرجى المحاولة لاحقًا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col px-6 py-6 pt-safe pb-safe">
      <div className="w-full max-w-sm mx-auto my-auto space-y-6">
        {/* Top Back Button */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => goBack()}
            aria-label="رجوع"
            className="flex size-11 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-xs active:scale-95 transition-all"
          >
            <ArrowRight className="size-5" />
          </button>
          <BrandSymbol className="h-11" />
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            إنشاء حساب جديد
          </h1>
          <p className="text-xs text-slate-500">
            انضم إلى منصة Nursing AI وابدأ الدراسة الذكية
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-50 dark:bg-red-950/50 p-4 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <span className="leading-5">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label htmlFor="register-field-1" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              الاسم الكامل
            </label>
            <div className="relative">
              <input id="register-field-1"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="محمد أحمد"
                required
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
              />
              <User className="absolute left-3 top-3 size-4 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-field-2" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <input id="register-field-2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                required
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
                dir="ltr"
              />
              <Mail className="absolute left-3 top-3 size-4 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-field-3" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              كلمة المرور
            </label>
            <div className="relative">
              <input id="register-field-3"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 أحرف على الأقل"
                required
                minLength={8}
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
                dir="ltr"
              />
              <Lock className="absolute left-3 top-3 size-4 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-field-4" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              الجامعة
            </label>
            <div className="relative">
              <input id="register-field-4"
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="الجامعة الإسلامية بغزة"
                required
                className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 pl-10 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
              />
              <GraduationCap className="absolute left-3 top-3 size-4 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-field-5" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              السنة الدراسية
            </label>
            <select id="register-field-5"
              value={nursingYear}
              onChange={(e) => setNursingYear(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden"
            >
              <option value="year1">السنة الأولى</option>
              <option value="year2">السنة الثانية</option>
              <option value="year3">السنة الثالثة</option>
              <option value="year4">السنة الرابعة</option>
              <option value="other">أخرى</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 active:scale-97 transition-all disabled:opacity-60 flex items-center justify-center mt-3"
          >
            {loading ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
          </button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            لديك حساب بالفعل؟{" "}
            <button
              onClick={() => goBack()}
              className="font-bold text-primary hover:underline"
            >
              تسجيل الدخول
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
