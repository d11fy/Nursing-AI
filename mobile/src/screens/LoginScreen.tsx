import React, { useState } from "react";
import { Sparkles, Mail, Lock, Eye, EyeOff, AlertCircle, Settings } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import { getServerUrl, setServerUrl, DEFAULT_SERVER_URL } from "../services/api";

export function LoginScreen() {
  const { login } = useAuth();
  const { navigate } = useNavigation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Server URL config sheet
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || "تعذر تسجيل الدخول؛ يرجى التحقق من البيانات");
    } finally {
      setLoading(false);
    }
  };

  const openServerConfig = async () => {
    const url = await getServerUrl();
    setServerUrlInput(url);
    setShowServerConfig(true);
  };

  const handleSaveServerUrl = async () => {
    if (serverUrlInput.trim()) {
      await setServerUrl(serverUrlInput.trim());
      setShowServerConfig(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between px-6 py-10 pt-safe pb-safe">
      <div className="w-full max-w-sm mx-auto my-auto space-y-8">
        {/* Logo and Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex size-16 items-center justify-center rounded-3xl bg-primary text-white shadow-xl shadow-primary/25">
            <Sparkles className="size-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Nursing AI
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            المنصة الذكية المتخصصة لطلاب التمريض
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-50 dark:bg-red-950/50 p-4 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 animate-in fade-in">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <span className="leading-5">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                required
                className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pl-11 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden transition-all"
                dir="ltr"
              />
              <Mail className="absolute left-3.5 top-3.5 size-5 text-slate-400" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pl-11 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-hidden transition-all"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3.5 top-3.5 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/25 active:scale-97 transition-all disabled:opacity-60 flex items-center justify-center mt-2"
          >
            {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

        {/* Link to Register */}
        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            ليس لديك حساب بعد؟{" "}
            <button
              onClick={() => navigate("register")}
              className="font-bold text-primary hover:underline"
            >
              إنشاء حساب جديد
            </button>
          </p>
        </div>
      </div>

      {/* Footer / Server endpoint config button */}
      <div className="text-center pt-6">
        <button
          onClick={openServerConfig}
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600"
        >
          <Settings className="size-3" />
          <span>خادم المنصة</span>
        </button>
      </div>

      {/* Server URL Config Modal */}
      {showServerConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              عنوان خادم Nursing AI
            </h3>
            <p className="text-xs text-slate-500">
              عنوان الـ Backend API الذي يتصل به التطبيق:
            </p>
            <input
              type="text"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder={DEFAULT_SERVER_URL}
              className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-3 text-xs font-mono"
              dir="ltr"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setServerUrlInput(DEFAULT_SERVER_URL)}
                className="px-3 h-10 rounded-xl bg-slate-100 text-[11px] font-bold text-slate-700"
              >
                الافتراضي
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setShowServerConfig(false)}
                className="px-4 h-10 rounded-xl bg-slate-100 text-xs font-bold text-slate-700"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveServerUrl}
                className="px-4 h-10 rounded-xl bg-primary text-xs font-bold text-white"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
