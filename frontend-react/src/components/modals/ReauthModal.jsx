import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import { KeyRound, ShieldAlert, Eye, EyeOff } from "lucide-react";

export function ReauthModal({ resolve, onClose }) {
  const { lang, showToast } = useVault();
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleClose() {
    if (resolve) resolve(null);
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    try {
      const res = await api("/auth/reauth", {
        method: "POST",
        body: { master_password: password },
      });
      if (res && res.reauth_token) {
        if (resolve) resolve(res.reauth_token);
        onClose();
      } else {
        throw new Error("Invalid response");
      }
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "كلمة المرور غير صحيحة" : "Incorrect password"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title={lang === "ar" ? "تأكيد الهوية مطلوب" : "Authentication Required"}
      subtitle={lang === "ar" ? "عملية حساسة تتطلب تأكيد كلمة المرور الرئيسية" : "Sensitive operation requires confirmation"}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <ShieldAlert className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          <span>
            {lang === "ar"
              ? "لحماية خزنتك من الوصول غير المصرح به، يرجى إدخال كلمة المرور الرئيسية لمتابعة هذا الإجراء."
              : "To protect your vault, please enter your master password to authorize this sensitive action."}
          </span>
        </div>

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
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-800 transition-colors"
          >
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!password || loading}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5" strokeWidth={1.8} />
                <span>{lang === "ar" ? "تأكيد والمتابعة" : "Confirm & Proceed"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
