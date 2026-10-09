import React, { useState, useEffect } from "react";
import { Sparkles, Mail, Eye, EyeOff, AlertCircle } from "lucide-react";
import { startGoogleLogin } from "../services/googleAuth";
import { ApiError, apiFetch, DEFAULT_SERVER_URL, getTokens, saveTokens } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";

export function LoginScreen() {
  const { login, refreshAuth } = useAuth();
  const { navigate } = useNavigation();

  const [email, setEmail] = useState("");
  const [secondFactor,setSecondFactor]=useState("");
  const [transferOpen,setTransferOpen]=useState(false),[transferCode,setTransferCode]=useState("");
  const [needsMfa,setNeedsMfa]=useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = (event: Event) => {
      setError((event as CustomEvent<string>).detail);
      setLoading(false);
    };
    window.addEventListener("nursing:auth-error", handle);
    return () => window.removeEventListener("nursing:auth-error", handle);
  }, []);
  const googleLogin = async () => {
    setError(null);
    try {
      await startGoogleLogin();
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر فتح Google");
    }
  };
  const forgotPassword = async () => {
    setError(null);
    if (!email.trim()) {
      setError("أدخل بريدك الإلكتروني أولًا لإرسال رابط الاستعادة");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setError(result.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : "تعذر إرسال الرابط");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password,secondFactor);
    } catch (err: unknown) {
      if(err instanceof ApiError && err.status===428) setNeedsMfa(true);
      setError(
        err instanceof Error
          ? err.message
          : "تعذر تسجيل الدخول؛ يرجى التحقق من البيانات",
      );
    } finally {
      setLoading(false);
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

        <a href={`${DEFAULT_SERVER_URL}/support`} target="_blank" rel="noreferrer" className="block min-h-11 text-primary underline">مساعدة في تسجيل الدخول</a>
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {needsMfa&&<label className="block">رمز المصادقة أو الاسترداد<input className="w-full h-12 rounded-xl border p-3" value={secondFactor} onChange={e=>setSecondFactor(e.target.value)} autoComplete="one-time-code" maxLength={32} dir="ltr" required /></label>}
          <div className="space-y-1.5">
            <label htmlFor="login-field-1" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <input id="login-field-1"
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
            <label htmlFor="login-field-2" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              كلمة المرور
            </label>
            <div className="relative">
              <input id="login-field-2"
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
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                aria-pressed={showPassword}
                aria-controls="login-field-2"
                className="absolute left-0.5 top-0.5 flex size-11 items-center justify-center rounded-2xl text-slate-500 hover:text-slate-700"
              >
                {showPassword ? (
                  <EyeOff className="size-5" aria-hidden />
                ) : (
                  <Eye className="size-5" aria-hidden />
                )}
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

        <div className="space-y-3">
          <button
            onClick={googleLogin}
            disabled={loading}
            className="w-full min-h-12 rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 font-bold text-sm"
          >
            المتابعة باستخدام Google
          </button>
          <button
            onClick={forgotPassword}
            disabled={loading}
            className="w-full min-h-11 text-primary text-sm font-bold"
          >
            نسيت كلمة المرور؟
          </button>
        </div>
        <button className="min-h-12 text-primary underline" onClick={()=>setTransferOpen(!transferOpen)}>نقل حسابي من جهاز آخر</button>
        {transferOpen&&<section className="surface space-y-3"><p className="text-sm">بعد التأكيد سيخرج الجهاز السابق من الحساب. أدخل البريد وكلمة المرور أعلاه ثم اطلب الرمز.</p>
          <button className="min-h-12 text-primary" disabled={loading} onClick={async()=>{setLoading(true);try{const result=await apiFetch("/api/auth/device-transfer",{method:"POST",body:JSON.stringify({action:"request",email,password})});setError(result.message);}catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الرمز");}finally{setLoading(false);}}}>إرسال رمز النقل إلى بريدي</button>
          <label className="block">رمز النقل<input className="w-full min-h-12 rounded-xl border p-3" value={transferCode} onChange={e=>setTransferCode(e.target.value.trim())} dir="ltr" maxLength={64} autoComplete="one-time-code" /></label>
          <button className="min-h-12 text-primary" disabled={loading||transferCode.length!==64} onClick={async()=>{setLoading(true);try{const {deviceToken}=await getTokens();const result=await apiFetch("/api/auth/device-transfer",{method:"POST",body:JSON.stringify({action:"confirm",token:transferCode,deviceToken:deviceToken||undefined})});await saveTokens(result.sessionToken,result.deviceToken);await refreshAuth();}catch(e){setError(e instanceof Error?e.message:"تعذر نقل الجهاز");}finally{setLoading(false);}}}>تأكيد النقل إلى هذا الهاتف</button>
        </section>}
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
    </div>
  );
}
