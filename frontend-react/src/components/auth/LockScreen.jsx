import React, { useState, useEffect } from "react";
import { useVault } from "../../context/VaultContext";
import { Shield, Lock, Eye, EyeOff, KeyRound, Globe, Sun, Moon, AlertTriangle } from "lucide-react";

export function LockScreen() {
  const { unlockVault, authStatus, checkStatus, t, lang, toggleLang, theme, toggleTheme, showToast } = useVault();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [throttle, setThrottle] = useState(authStatus?.throttle_seconds_remaining || 0);

  useEffect(() => {
    if (authStatus?.throttle_seconds_remaining) {
      setThrottle(authStatus.throttle_seconds_remaining);
    }
  }, [authStatus?.throttle_seconds_remaining]);

  // Tick down throttle timer
  useEffect(() => {
    if (throttle <= 0) return;
    const interval = setInterval(() => {
      setThrottle((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          checkStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [throttle, checkStatus]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || throttle > 0 || loading) return;

    setLoading(true);
    try {
      await unlockVault(password);
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "كلمة المرور غير صحيحة" : "Incorrect password"), "error");
    } finally {
      setLoading(false);
    }
  }

  const hint = authStatus?.password_hint;

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-canvas-950 text-text-primary p-6 relative select-none">
      {/* Top Bar with Lang & Theme toggles */}
      <div className="flex items-center justify-between w-full max-w-5xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <Shield className="w-4 h-4" strokeWidth={2} />
          </div>
          <span className="font-semibold text-sm tracking-wide text-text-primary">
            {lang === "ar" ? "خزنة الأسرار" : "Secrets Vault"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-canvas-800 transition-colors"
            title={theme === "dark" ? "Light Mode" : "Dark Mode"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" strokeWidth={1.8} /> : <Moon className="w-4 h-4" strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary hover:bg-canvas-800 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span>{lang === "ar" ? "English" : "العربية"}</span>
          </button>
        </div>
      </div>

      {/* Main Lock Card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-canvas-900 border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden backdrop-blur">
          {/* Accent Glow */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-600" />

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4 shadow-inner">
              <Lock className="w-7 h-7" strokeWidth={1.8} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {lang === "ar" ? "الخزنة مقفلة ومحمية" : "Vault is Locked"}
            </h1>
            <p className="text-xs text-text-muted mt-1.5">
              {lang === "ar"
                ? "أدخل كلمة المرور الرئيسية لفك تشفير البيانات الحساسة ومفاتيح API"
                : "Enter your master password to decrypt vault keys and credentials"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lang === "ar" ? "كلمة المرور الرئيسية..." : "Master password..."}
                  disabled={throttle > 0 || loading}
                  autoFocus
                  className="w-full h-11 px-4 pe-11 text-sm bg-canvas-950 border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className={`absolute top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-2 transition-colors ${
                    lang === "ar" ? "left-1" : "right-1"
                  }`}
                  tabIndex={-1}
                >
                  {showPass ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>

            {/* Throttle Countdown Warning */}
            {throttle > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                <span>
                  {lang === "ar"
                    ? `تم تجاوز محاولات الدخول. يرجى الانتظار ${throttle} ثانية.`
                    : `Too many attempts. Please wait ${throttle} seconds.`}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={!password || throttle > 0 || loading}
              className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" strokeWidth={1.8} />
                  <span>{t("unlock")}</span>
                </>
              )}
            </button>
          </form>

          {/* Password Hint */}
          {hint && (
            <div className="mt-5 pt-4 border-t border-border text-center">
              {!showHint ? (
                <button
                  type="button"
                  onClick={() => setShowHint(true)}
                  className="text-xs text-text-muted hover:text-brand-400 transition-colors"
                >
                  {lang === "ar" ? "هل نسيت تلميح كلمة المرور؟" : "Show password hint"}
                </button>
              ) : (
                <div className="p-3 rounded-lg bg-canvas-950 border border-border text-xs text-text-secondary text-start animate-fade-in">
                  <span className="font-semibold text-text-primary block mb-0.5">
                    {lang === "ar" ? "تلميح كلمة المرور:" : "Password hint:"}
                  </span>
                  <span className="break-words">{hint}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-text-muted mt-6">
          {lang === "ar"
            ? "تشفير محلي عالي الحماية AES-256-GCM مع اشتقاق مفاتيح Argon2id"
            : "Protected by AES-256-GCM & Argon2id zero-knowledge key derivation"}
        </p>
      </div>

      {/* Footer */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between text-xs text-text-muted">
        <span>Secrets Vault Enterprise v2.0</span>
        <span>Local & Offline-First</span>
      </div>
    </div>
  );
}
