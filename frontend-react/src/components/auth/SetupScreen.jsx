import React, { useState } from "react";
import { useVault } from "../../context/VaultContext";
import { Shield, KeyRound, Eye, EyeOff, Globe, Sun, Moon, AlertTriangle, Check } from "lucide-react";

export function SetupScreen() {
  const { setupVault, lang, toggleLang, theme, toggleTheme, showToast } = useVault();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hint, setHint] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Strength calculation
  const lengthValid = password.length >= 12;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const criteriaCount = [lengthValid, hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  const isMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = lengthValid && isMatch && criteriaCount >= 3;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    try {
      await setupVault(password, hint);
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر إعداد الخزنة" : "Failed to initialize vault"), "error");
    } finally {
      setLoading(false);
    }
  }

  let strengthColor = "bg-rose-500";
  let strengthLabel = lang === "ar" ? "ضعيفة" : "Weak";
  if (criteriaCount >= 4 && password.length >= 14) {
    strengthColor = "bg-emerald-500";
    strengthLabel = lang === "ar" ? "قوية جداً" : "Very Strong";
  } else if (criteriaCount >= 3) {
    strengthColor = "bg-amber-500";
    strengthLabel = lang === "ar" ? "متوسطة" : "Medium";
  }

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-canvas-950 text-text-primary p-6 relative select-none">
      {/* Top Bar */}
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

      {/* Main Setup Card */}
      <div className="w-full max-w-lg mx-auto my-auto py-6">
        <div className="bg-canvas-900 border border-border rounded-2xl p-8 shadow-2xl relative overflow-hidden backdrop-blur">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-600 via-indigo-500 to-emerald-500" />

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mx-auto mb-4">
              <Shield className="w-7 h-7" strokeWidth={1.8} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {lang === "ar" ? "إعداد الخزنة لأول مرة" : "Initialize Secrets Vault"}
            </h1>
            <p className="text-xs text-text-muted mt-1.5 max-w-sm mx-auto">
              {lang === "ar"
                ? "عيّن كلمة مرور رئيسية قوية لتشفير مفاتيح الخزنة محلياً. لا يمكن استعادة البيانات إذا نسيت كلمة المرور."
                : "Create a strong master password to encrypt your vault locally. Zero-knowledge: there is no password reset."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                {lang === "ar" ? "كلمة المرور الرئيسية" : "Master Password"}
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  autoFocus
                  className="w-full h-10 px-3.5 pe-10 text-sm bg-canvas-950 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className={`absolute top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-2 transition-colors ${
                    lang === "ar" ? "left-1" : "right-1"
                  }`}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" strokeWidth={1.8} /> : <Eye className="w-4 h-4" strokeWidth={1.8} />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {password.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">{lang === "ar" ? "قوة كلمة المرور:" : "Strength:"}</span>
                    <span className="font-semibold text-text-primary">{strengthLabel}</span>
                  </div>
                  <div className="w-full h-1.5 bg-canvas-950 rounded-full overflow-hidden flex gap-1">
                    <div className={`h-full flex-1 rounded-full ${criteriaCount >= 1 ? strengthColor : "bg-canvas-800"}`} />
                    <div className={`h-full flex-1 rounded-full ${criteriaCount >= 2 ? strengthColor : "bg-canvas-800"}`} />
                    <div className={`h-full flex-1 rounded-full ${criteriaCount >= 3 ? strengthColor : "bg-canvas-800"}`} />
                    <div className={`h-full flex-1 rounded-full ${criteriaCount >= 4 ? strengthColor : "bg-canvas-800"}`} />
                    <div className={`h-full flex-1 rounded-full ${criteriaCount >= 5 ? strengthColor : "bg-canvas-800"}`} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                {lang === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}
              </label>
              <input
                type={showPass ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className={`w-full h-10 px-3.5 text-sm bg-canvas-950 border rounded-xl text-text-primary focus:outline-none focus:ring-1 font-mono transition-all ${
                  confirmPassword && !isMatch
                    ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                    : "border-border focus:border-brand-500 focus:ring-brand-500"
                }`}
              />
              {confirmPassword && !isMatch && (
                <p className="text-[11px] text-rose-400">
                  {lang === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                {lang === "ar" ? "تلميح كلمة المرور (اختياري)" : "Password Hint (Optional)"}
              </label>
              <input
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder={lang === "ar" ? "تلميح لا يحتوي على كلمة المرور نفسها..." : "Hint without revealing password..."}
                className="w-full h-10 px-3.5 text-sm bg-canvas-950 border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.8} />
              <span>
                {lang === "ar"
                  ? "تنبيه هام: يتم التشفير محلياً بنموذج Zero-Knowledge. في حال نسيان كلمة المرور الرئيسية، لن يتمكن أحد من استرجاع بياناتك."
                  : "Important: Local zero-knowledge encryption. If you lose your master password, your vault data cannot be recovered."}
              </span>
            </div>

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" strokeWidth={1.8} />
                  <span>{lang === "ar" ? "إنشاء الخزنة وبدء الاستخدام" : "Initialize & Secure Vault"}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto flex items-center justify-between text-xs text-text-muted">
        <span>Secrets Vault Enterprise v2.0</span>
        <span>Argon2id + AES-256-GCM</span>
      </div>
    </div>
  );
}
