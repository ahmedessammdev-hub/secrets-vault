import React from "react";
import { useVault } from "../../context/VaultContext";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export function ToastContainer() {
  const { toasts, lang } = useVault();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className={`fixed bottom-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none ${
        lang === "ar" ? "left-5 items-start" : "right-5 items-end"
      }`}
    >
      {toasts.map((toast) => {
        let icon = <Info className="w-4 h-4 text-blue-400 shrink-0" strokeWidth={2} />;
        let borderColor = "border-blue-500/30";
        let bgColor = "bg-canvas-900";

        if (toast.type === "success") {
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />;
          borderColor = "border-emerald-500/30";
        } else if (toast.type === "error") {
          icon = <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" strokeWidth={2} />;
          borderColor = "border-rose-500/30";
        } else if (toast.type === "warning") {
          icon = <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={2} />;
          borderColor = "border-amber-500/30";
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border ${borderColor} ${bgColor} text-text-primary shadow-xl text-xs sm:text-sm animate-fade-in font-medium`}
            style={{ minWidth: "260px" }}
          >
            {icon}
            <span className="flex-1 break-words">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
