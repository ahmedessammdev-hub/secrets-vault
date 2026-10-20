import React, { useState, useEffect, useRef } from "react";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import {
  Shield,
  Star,
  ExternalLink,
  Clock,
  Pencil,
  Bookmark,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  History,
  QrCode,
  Paperclip,
  Upload,
  Download,
  FileText,
  Lock,
} from "lucide-react";

export default function ItemDetail() {
  const {
    t,
    lang,
    selectedItem,
    selectItem,
    projects,
    categories,
    openModal,
    showToast,
    loadVaultData,
  } = useVault();

  const [revealedFields, setRevealedFields] = useState({}); // { [fieldId]: countdown }
  const [copiedFieldId, setCopiedFieldId] = useState(null);
  const [totpData, setTotpData] = useState({}); // { [fieldId]: { code, seconds_remaining } }
  const [attachments, setAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const countdownTimers = useRef({});
  const totpInterval = useRef(null);

  // Load attachments when selectedItem changes
  useEffect(() => {
    if (!selectedItem?.id) {
      setAttachments([]);
      return;
    }
    setLoadingAttachments(true);
    api(`/items/${selectedItem.id}/attachments`)
      .then((data) => setAttachments(data || []))
      .catch(() => setAttachments([]))
      .finally(() => setLoadingAttachments(false));

    return () => {
      Object.values(countdownTimers.current).forEach(clearInterval);
      if (totpInterval.current) clearInterval(totpInterval.current);
    };
  }, [selectedItem?.id]);

  // Handle Live TOTP Tickers for TOTP fields
  useEffect(() => {
    if (!selectedItem?.payload?.fields) return;
    const totpFields = selectedItem.payload.fields.filter((f) => f.type === "totp");
    if (totpFields.length === 0) return;

    const fetchTotps = async () => {
      for (const f of totpFields) {
        try {
          const res = await api(`/items/${selectedItem.id}/fields/${f.id}/totp`);
          setTotpData((prev) => ({
            ...prev,
            [f.id]: res,
          }));
        } catch (e) {}
      }
    };

    fetchTotps();
    totpInterval.current = setInterval(fetchTotps, 1000);

    return () => {
      if (totpInterval.current) clearInterval(totpInterval.current);
    };
  }, [selectedItem]);

  if (!selectedItem) {
    return (
      <section className="flex-1 bg-slate-950 flex flex-col items-center justify-center text-center p-8 select-none">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500 shadow-inner">
          <Shield className="w-8 h-8 stroke-[1.5]" />
        </div>
        <h3 className="text-base font-bold text-slate-300 mb-1">{t("selectPrompt")}</h3>
        <p className="text-xs text-slate-500 max-w-sm">{t("selectPromptSub")}</p>
      </section>
    );
  }

  const payload = selectedItem.payload || {};
  const fields = payload.fields || [];
  const project = projects.find((p) => p.id === selectedItem.project_id);
  const category = categories.find((c) => c.id === selectedItem.category_id);

  // Toggle Favorite
  const handleToggleFavorite = async () => {
    try {
      const res = await api(`/items/${selectedItem.id}/favorite`, { method: "POST" });
      await selectItem(selectedItem.id);
      await loadVaultData();
      showToast(res.is_favorite ? t("favorites") : t("all"), "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Copy Field
  const handleCopy = async (fieldId, val) => {
    try {
      const res = await api(`/items/${selectedItem.id}/copy-field?field_id=${fieldId}`, { method: "POST" });
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(String(val || "")).catch(() => {});
      }
      setCopiedFieldId(fieldId);
      setTimeout(() => setCopiedFieldId(null), 1800);
      showToast(res.message, "success");
    } catch (e) {
      showToast(lang === "ar" ? "تعذر النسخ" : "Copy failed", "error");
    }
  };

  // Reveal / Hide Field (15s auto-hide)
  const handleToggleReveal = (fieldId) => {
    if (revealedFields[fieldId] !== undefined) {
      // Hide immediately
      clearInterval(countdownTimers.current[fieldId]);
      delete countdownTimers.current[fieldId];
      setRevealedFields((prev) => {
        const copy = { ...prev };
        delete copy[fieldId];
        return copy;
      });
      return;
    }

    // Start 15s countdown
    let remaining = 15;
    setRevealedFields((prev) => ({ ...prev, [fieldId]: remaining }));

    countdownTimers.current[fieldId] = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimers.current[fieldId]);
        delete countdownTimers.current[fieldId];
        setRevealedFields((prev) => {
          const copy = { ...prev };
          delete copy[fieldId];
          return copy;
        });
      } else {
        setRevealedFields((prev) => ({ ...prev, [fieldId]: remaining }));
      }
    }, 1000);
  };

  // Save As Template
  const handleSaveAsTemplate = async () => {
    try {
      const tplName = selectedItem.payload?.title || "Custom Template";
      await api(`/templates/save-as-template?item_id=${selectedItem.id}&name=${encodeURIComponent(tplName)}`, { method: "POST" });
      await loadVaultData();
      showToast(lang === "ar" ? "تم حفظ العنصر كقالب جديد" : "Saved as new template", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Delete Item
  const handleDeleteItem = async () => {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await api(`/items/${selectedItem.id}`, { method: "DELETE" });
      await loadVaultData();
      selectItem(null);
      showToast(t("delete"), "info");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Upload Attachment
  const handleUploadAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api(`/items/${selectedItem.id}/attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await api(`/items/${selectedItem.id}/attachments`);
      setAttachments(data || []);
      showToast(t("attachments"), "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Delete Attachment
  const handleDeleteAttachment = async (attId) => {
    try {
      await api(`/items/${selectedItem.id}/attachments/${attId}`, { method: "DELETE" });
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
      showToast(t("delete"), "info");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  return (
    <section className="flex-1 bg-canvas-950 flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto custom-scrollbar">
      {/* Header Bar */}
      <div className="border-b border-border bg-canvas-900/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-text-primary truncate">
              {payload.title || "Untitled"}
            </h1>
            <button
              onClick={handleToggleFavorite}
              className="p-1 rounded-lg hover:bg-canvas-800 text-text-muted hover:text-amber-400 transition"
              title={t("favorites")}
            >
              <Star
                className={`w-4 h-4 ${
                  selectedItem.is_favorite ? "fill-amber-400 text-amber-400" : ""
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs text-text-secondary">
            {project && (
              <span className="px-2 py-0.5 rounded-full bg-canvas-850 border border-border text-text-secondary font-medium">
                {project.payload?.name}
              </span>
            )}
            {category && (
              <span
                className="px-2 py-0.5 rounded-full border text-xs font-medium"
                style={{
                  borderColor: category.payload?.color || "#38bdf8",
                  color: category.payload?.color || "#38bdf8",
                }}
              >
                {category.payload?.name}
              </span>
            )}
            {payload.website_url && (
              <a
                href={payload.website_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-brand-400 hover:underline font-mono text-[11px]"
              >
                <span>{payload.website_url}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {selectedItem.expires_at && (
              <span className="flex items-center gap-1 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 text-[11px] font-mono">
                <Clock className="w-3 h-3" />
                <span>{selectedItem.expires_at.split("T")[0]}</span>
              </span>
            )}
          </div>

          {payload.description && (
            <p className="text-xs text-text-secondary pt-1 leading-relaxed">{payload.description}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openModal("itemEdit", { item: selectedItem })}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-brand-500/40 bg-canvas-850 hover:bg-canvas-800 text-text-primary transition flex items-center gap-1.5 shadow-sm"
          >
            <Pencil className="w-3.5 h-3.5 text-brand-400" />
            <span>{t("edit")}</span>
          </button>

          <button
            onClick={handleSaveAsTemplate}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-slate-700 bg-canvas-850 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1.5"
            title={t("saveAsTemplate")}
          >
            <Bookmark className="w-3.5 h-3.5 text-text-muted" />
            <span className="hidden md:inline">{t("saveAsTemplate")}</span>
          </button>

          <button
            onClick={handleDeleteItem}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition flex items-center gap-1.5"
            title={t("delete")}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{t("delete")}</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 sm:p-6 space-y-6 flex-1">
        {/* Fields Group */}
        <div className="space-y-3">
          {fields.map((f) => {
            const isSecret = f.is_secret || f.type === "secret";
            const isTotp = f.type === "totp";
            const isRevealed = revealedFields[f.id] !== undefined;
            const isCopied = copiedFieldId === f.id;

            let displayVal = f.value;
            if (f.values) {
              displayVal = f.values["production"] || f.values["default"] || Object.values(f.values)[0] || "";
            }

            const masked = isSecret && !isRevealed ? "••••••••••••••••" : String(displayVal || "");
            const totpObj = totpData[f.id];

            // Space TOTP digits 497 846
            const formattedTotp = totpObj?.code && String(totpObj.code).length === 6
              ? `${String(totpObj.code).slice(0, 3)} ${String(totpObj.code).slice(3)}`
              : totpObj?.code || "------";

            const isTotpExpiring = (totpObj?.seconds_remaining || 30) <= 5;

            return (
              <div
                key={f.id}
                className="p-3.5 rounded-xl border border-border bg-canvas-900/50 hover:border-brand-500/30 transition space-y-2"
              >
                {/* Field Top Bar */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                      {f.label}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-canvas-950 border border-border text-text-muted">
                      {f.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* TOTP QR */}
                    {isTotp && (
                      <button
                        onClick={() => openModal("qr", { itemId: selectedItem.id, fieldId: f.id, label: f.label })}
                        className="text-xs px-2 py-1 rounded-lg bg-canvas-850 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1"
                        title={t("viewQr")}
                      >
                        <QrCode className="w-3.5 h-3.5 text-brand-400" />
                        <span>QR</span>
                      </button>
                    )}

                    {/* Reveal/Hide */}
                    {isSecret && (
                      <button
                        onClick={() => handleToggleReveal(f.id)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-canvas-850 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1"
                      >
                        {isRevealed ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-mono">{revealedFields[f.id]}s</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5 text-text-muted" />
                            <span>{t("reveal")}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* History */}
                    {isSecret && f.history && f.history.length > 0 && (
                      <button
                        onClick={() => openModal("history", { itemId: selectedItem.id, fieldId: f.id, label: f.label })}
                        className="text-xs px-2 py-1 rounded-lg bg-canvas-850 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1"
                        title={t("history")}
                      >
                        <History className="w-3.5 h-3.5 text-text-muted" />
                        <span>({f.history.length})</span>
                      </button>
                    )}

                    {/* Copy Button */}
                    <button
                      onClick={() => handleCopy(f.id, displayVal)}
                      className={`text-xs px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 font-semibold ${
                        isCopied
                          ? "bg-emerald-600 text-white"
                          : "bg-brand-600 hover:bg-brand-500 text-white shadow-sm"
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>{t("copied")}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t("copy")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Field Value Box */}
                <div className="p-2.5 rounded-xl bg-canvas-950 border border-border flex items-center justify-between">
                  {isTotp ? (
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className={`px-3 py-1 rounded-full border flex items-center gap-2 font-mono font-bold text-sm ${
                          isTotpExpiring
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        }`}
                      >
                        <span className="tracking-widest text-base font-extrabold">{formattedTotp}</span>
                        <span className="text-[11px] opacity-75 font-normal">
                          {totpObj?.seconds_remaining || 30}s
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-600 truncate dir-ltr">
                        {isRevealed ? displayVal : masked}
                      </span>
                    </div>
                  ) : (
                    <span
                      className={`font-mono text-sm tracking-tight text-slate-200 break-all select-all dir-ltr text-left ${
                        isSecret && !isRevealed ? "tracking-widest text-slate-400" : ""
                      }`}
                    >
                      {masked}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Encrypted Attachments Section */}
        <div className="p-4 rounded-xl border border-border bg-canvas-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-brand-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t("attachments")}
              </h3>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-canvas-950 border border-border text-text-muted">
                {attachments.length}
              </span>
            </div>

            <label className="cursor-pointer text-xs font-medium px-2.5 py-1 rounded-lg bg-canvas-850 hover:bg-canvas-800 text-text-primary transition flex items-center gap-1.5 border border-border shadow-sm">
              <Upload className="w-3.5 h-3.5 text-brand-400" />
              <span>{t("uploadAttachment")}</span>
              <input
                type="file"
                onChange={handleUploadAttachment}
                className="hidden"
              />
            </label>
          </div>

          {loadingAttachments ? (
            <div className="text-xs text-text-muted py-2">Loading...</div>
          ) : attachments.length === 0 ? (
            <div className="text-xs text-text-muted py-2">No attachments</div>
          ) : (
            <div className="space-y-1.5">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-canvas-950 border border-border text-xs text-text-primary"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{att.filename}</span>
                    <span className="text-[10px] font-mono text-text-muted">
                      ({Math.round((att.size_bytes || 0) / 1024)} KB)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`/items/${selectedItem.id}/attachments/${att.id}`}
                      download={att.filename}
                      className="p-1 rounded-lg hover:bg-canvas-850 text-brand-400 transition"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="p-1 rounded-lg hover:bg-canvas-850 text-rose-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
