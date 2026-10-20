import React, { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({ isOpen = true, onClose, title, subtitle, children, maxWidth = "max-w-2xl" }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* Backdrop overlay */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Dialog Card */}
      <div
        className={`relative w-full ${maxWidth} bg-canvas-900 border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-canvas-950/50">
          <div>
            <h3 className="text-base font-semibold text-text-primary tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-canvas-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-text-secondary custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
