import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import { History, RotateCcw, Trash2, Eye, EyeOff, Calendar } from "lucide-react";

export function FieldHistoryModal({ itemId, fieldId, label, onClose }) {
  const { lang, selectedItem, selectItem, loadVaultData, showToast } = useVault();
  const [revealedIdx, setRevealedIdx] = useState({});
  const [loadingIdx, setLoadingIdx] = useState(null);
  const [clearing, setClearing] = useState(false);

  const field = selectedItem?.payload?.fields?.find((f) => f.id === fieldId);
  const history = field?.history || [];

  function toggleReveal(idx) {
    setRevealedIdx((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  async function handleRestore(idx) {
    setLoadingIdx(idx);
    try {
      await api(`/items/${itemId}/fields/${fieldId}/history/restore?history_idx=${idx}`, {
        method: "POST",
      });
      showToast(lang === "ar" ? "تمت استعادة القيمة السابقة بنجاح" : "Field value restored", "success");
      await selectItem(itemId);
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر استعادة القيمة" : "Failed to restore value"), "error");
    } finally {
      setLoadingIdx(null);
    }
  }

  async function handleClearHistory() {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من مسح سجل هذا الحقل نهائياً؟" : "Permanently clear this field history?")) {
      return;
    }

    setClearing(true);
    try {
      await api(`/items/${itemId}/fields/${fieldId}/history`, {
        method: "DELETE",
      });
      showToast(lang === "ar" ? "تم مسح السجل بنجاح" : "History cleared", "success");
      await selectItem(itemId);
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر مسح السجل" : "Failed to clear history"), "error");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "سجل تغييرات الحقل" : "Field History"}
      subtitle={`${label || (lang === "ar" ? "الحقل" : "Field")} (${history.length} ${
        lang === "ar" ? "نسخ محفوظة" : "saved versions"
      })`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {history.length === 0 ? (
          <div className="py-10 text-center text-text-muted">
            <History className="w-10 h-10 mx-auto mb-2 opacity-30" strokeWidth={1.5} />
            <p className="text-xs">
              {lang === "ar"
                ? "لا توجد نسخ سابقة محفوظة لهذا الحقل حتى الآن."
                : "No prior values recorded for this field yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((entry, idx) => {
              const isRevealed = Boolean(revealedIdx[idx]);
              const dateStr = entry.replaced_at
                ? new Date(entry.replaced_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—";

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-canvas-950 border border-border flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                      <Calendar className="w-3.5 h-3.5" strokeWidth={1.8} />
                      <span>{dateStr}</span>
                      {entry.env && entry.env !== "default" && (
                        <span className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-mono text-[10px]">
                          {entry.env}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-text-primary break-all">
                      {isRevealed ? entry.value : "••••••••••••••••"}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleReveal(idx)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-canvas-800 transition-colors"
                      title={isRevealed ? "Hide" : "Reveal"}
                    >
                      {isRevealed ? <EyeOff className="w-4 h-4" strokeWidth={1.8} /> : <Eye className="w-4 h-4" strokeWidth={1.8} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(idx)}
                      disabled={loadingIdx !== null}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas-800 hover:bg-brand-600 hover:text-white text-text-secondary transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
                      <span>{lang === "ar" ? "استعادة" : "Restore"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border">
          {history.length > 0 ? (
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearing}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span>{lang === "ar" ? "مسح السجل نهائياً" : "Clear History"}</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-800 transition-colors"
          >
            {lang === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
