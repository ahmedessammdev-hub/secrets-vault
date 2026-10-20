import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import {
  Sparkles,
  FileText,
  Upload,
  ShieldCheck,
  Check,
  AlertCircle,
  Settings,
  Bot,
  Terminal,
  ExternalLink,
  FolderGit2,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  X,
  Paperclip,
  Camera,
} from "lucide-react";

export function ImportModal({ onClose, initialTab = "ai" }) {
  const { lang, projects, categories, loadVaultData, showToast, openModal } = useVault();
  const [activeTab, setActiveTab] = useState(initialTab); // ai | bitwarden | csv

  // AI State
  const [rawText, setRawText] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [extractedItems, setExtractedItems] = useState(null);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState(null);

  // Multi-Provider & Vision State
  const [providers, setProviders] = useState([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [attachedImages, setAttachedImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  // Timer & Robustness State
  const [elapsedSec, setElapsedSec] = useState(0);
  const [extractionError, setExtractionError] = useState(null);
  const abortControllerRef = useRef(null);

  // File Upload State
  const [file, setFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    let interval = null;
    if (aiLoading) {
      setElapsedSec(0);
      interval = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
    } else {
      setElapsedSec(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [aiLoading]);

  useEffect(() => {
    async function loadStatusAndProviders() {
      try {
        const st = await api("/llm/status");
        setLlmStatus(st);
      } catch (e) {}

      try {
        const pRes = await api("/llm/providers");
        if (pRes && pRes.providers && pRes.providers.length > 0) {
          setProviders(pRes.providers);
          const activeId = pRes.active_id || pRes.providers[0].id;
          setSelectedProviderId(activeId);
        }
      } catch (e) {}
    }
    loadStatusAndProviders();
  }, []);

  const activeProvider = providers.find((p) => p.id === selectedProviderId) || providers[0];
  const supportsVision = Boolean(activeProvider ? activeProvider.supports_vision : llmStatus?.supports_vision);

  function handleProcessImageFile(imgFile) {
    if (!imgFile || !imgFile.type.startsWith("image/")) {
      showToast(lang === "ar" ? "الملف المحدد ليس صورة" : "Selected file is not an image", "error");
      return;
    }
    if (imgFile.size > 10 * 1024 * 1024) {
      showToast(lang === "ar" ? "حجم الصورة يتجاوز 10 ميغابايت" : "Image exceeds 10MB limit", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setAttachedImages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random().toString(),
          name: imgFile.name || "Screenshot.png",
          size: (imgFile.size / 1024).toFixed(1) + " KB",
          dataUrl,
        },
      ]);
    };
    reader.readAsDataURL(imgFile);
  }

  function handlePaste(e) {
    if (!supportsVision) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          handleProcessImageFile(blob);
          e.preventDefault();
        }
      }
    }
  }

  function removeAttachedImage(id) {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }

  // AI Step 1: Preview Redaction
  async function handleAiPreview() {
    if (!rawText.trim()) return;
    setAiLoading(true);
    try {
      const res = await api("/llm/smart-import/preview", {
        method: "POST",
        body: { text: rawText },
      });
      setPreviewData(res);
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر إنشاء المعاينة" : "Failed to preview redaction"), "error");
    } finally {
      setAiLoading(false);
    }
  }

  // AI Step 2: Run Extraction
  async function handleAiRun(overrideProviderId) {
    const targetProviderId = overrideProviderId || selectedProviderId;
    if (!rawText.trim() && attachedImages.length === 0) {
      showToast(
        lang === "ar"
          ? "يرجى إدخال نص غير منظم أو إرفاق صورة واحدة على الأقل"
          : "Please enter text or attach at least one image",
        "warning"
      );
      return;
    }
    setAiLoading(true);
    setExtractionError(null);
    abortControllerRef.current = new AbortController();

    try {
      const res = await api("/llm/smart-import/run", {
        method: "POST",
        body: {
          text: rawText,
          provider_item_id: targetProviderId || undefined,
          images: attachedImages.length > 0 ? attachedImages.map((img) => img.dataUrl) : undefined,
        },
        signal: abortControllerRef.current.signal,
      });
      if (!res.items || res.items.length === 0) {
        showToast(lang === "ar" ? "لم يتم العثور على أسرار قابلة للاستخراج" : "No extractable secrets found", "warning");
      } else {
        const enriched = res.items.map((it) => {
          const hasNewProj = Boolean(it.suggested_new_project && !it.project_id);
          const hasNewCat = Boolean(it.suggested_new_category && !it.category_id);
          return {
            ...it,
            projectId: it.project_id || "",
            isNewProject: hasNewProj,
            newProjectName: it.suggested_new_project || "",
            categoryId: it.category_id || "",
            isNewCategory: hasNewCat,
            newCategoryName: it.suggested_new_category || "",
            tagsStr: (it.tags || ["imported"]).join(", "),
            rotationDays: it.rotation_days !== undefined && it.rotation_days !== null ? String(it.rotation_days) : "",
            description: it.description || "",
            showAdvanced: true,
          };
        });
        setExtractedItems(enriched);
        setExtractionError(null);
      }
    } catch (err) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        showToast(lang === "ar" ? "تم إلغاء عملية الاستخراج" : "Extraction cancelled", "info");
      } else {
        setExtractionError(err.message || "Extraction failed");
        showToast(err.message || (lang === "ar" ? "تعذر استخراج العناصر عبر المساعد الذكي" : "Extraction failed"), "error");
      }
    } finally {
      setAiLoading(false);
    }
  }

  function handleAbortAiRun() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setAiLoading(false);
    showToast(lang === "ar" ? "تم إيقاف المعالجة" : "Operation cancelled", "info");
  }

  function updateItem(idx, key, val) {
    setExtractedItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      return next;
    });
  }

  function toggleItemAdvanced(idx) {
    setExtractedItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], showAdvanced: !next[idx].showAdvanced };
      return next;
    });
  }

  // AI Step 3: Commit
  async function handleAiCommit() {
    if (!extractedItems || extractedItems.length === 0) return;
    setAiLoading(true);
    try {
      const itemsPayload = extractedItems.map((item) => ({
        title: item.title,
        template_hint: item.template_hint,
        website_url: item.website_url,
        fields: item.fields,
        project_id: item.isNewProject ? null : (item.projectId || null),
        new_project_name: item.isNewProject ? item.newProjectName : null,
        category_id: item.isNewCategory ? null : (item.categoryId || null),
        new_category_name: item.isNewCategory ? item.newCategoryName : null,
        tags: item.tagsStr
          ? item.tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
          : ["imported"],
        rotation_days: item.rotationDays ? parseInt(item.rotationDays, 10) : null,
        description: item.description || null,
      }));

      const res = await api("/llm/smart-import/commit", {
        method: "POST",
        body: {
          items: itemsPayload,
        },
      });
      showToast(
        lang === "ar"
          ? `تم استيراد ${res.created_count || extractedItems.length} عنصر وتشفيرها في الخزنة بنجاح!`
          : `Successfully imported and encrypted ${res.created_count || extractedItems.length} items!`,
        "success"
      );
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر حفظ العناصر المستوردة" : "Failed to commit items"), "error");
    } finally {
      setAiLoading(false);
    }
  }

  // File Upload Handler (Bitwarden & CSV)
  async function handleFileUpload(formatType) {
    if (!file) return;
    setFileLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format_type", formatType);

      const res = await api("/items/import/local", {
        method: "POST",
        body: formData,
      });

      showToast(
        lang === "ar"
          ? `تم استيراد ${res.imported_count || 0} عنصر بنجاح!`
          : `Imported ${res.imported_count || 0} items successfully!`,
        "success"
      );
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "فشل الاستيراد" : "Import failed"), "error");
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "المساعد الذكي واستيراد الأسرار" : "AI Assistant & Credentials Import"}
      subtitle={
        lang === "ar"
          ? "استيراد ذكي خاضع للتنقيح الآلي Zero-Knowledge أو استيراد ملفات Bitwarden و CSV"
          : "Zero-Knowledge redacted AI import or Bitwarden / CSV migration"
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex rounded-xl bg-canvas-950 p-1 border border-border">
          {[
            { id: "ai", label: lang === "ar" ? "استيراد ذكي بالذكاء الاصطناعي (AI)" : "AI Smart Import", icon: Sparkles },
            { id: "bitwarden", label: lang === "ar" ? "ملف Bitwarden" : "Bitwarden JSON", icon: FileText },
            { id: "csv", label: lang === "ar" ? "ملف CSV" : "CSV File", icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setFile(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-canvas-800 text-cyan-400 shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? "text-cyan-400" : "text-text-muted"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: AI Smart Import */}
        {activeTab === "ai" && (
          <div className="space-y-3.5" onPaste={handlePaste}>
            {/* Active AI Provider Selector Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-canvas-950 border border-border text-xs gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-semibold text-text-primary shrink-0">
                  {lang === "ar" ? "مزود الذكاء الاصطناعي:" : "AI Provider:"}
                </span>
                {providers.length > 0 ? (
                  <select
                    value={selectedProviderId}
                    onChange={(e) => setSelectedProviderId(e.target.value)}
                    className="h-8 px-2.5 rounded-lg bg-canvas-900 border border-border text-text-primary text-xs font-medium focus:outline-none focus:border-cyan-500 max-w-[240px] truncate"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.model}) {p.supports_vision ? "👁️ Vision" : "📝 Text"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-canvas-900 border border-border text-text-secondary font-mono text-[11px]">
                    {llmStatus?.active_backend === "agy_cli"
                      ? "Google Antigravity CLI"
                      : `OpenAI / Local (${llmStatus?.active_model || "gpt-4o"})`}
                  </span>
                )}
                {supportsVision ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono flex items-center gap-1 shrink-0">
                    <span>👁️</span>
                    <span>Vision Ready</span>
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-canvas-900 border border-border text-text-muted font-mono shrink-0">
                    Text Only
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openModal("settings", { initialTab: "llm" });
                }}
                className="text-[11px] text-brand-400 hover:text-brand-300 underline font-medium flex items-center gap-1 shrink-0"
              >
                <span>{lang === "ar" ? "إدارة المزودات" : "Manage AI"}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {/* Zero-Knowledge Redaction Banner */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-cyan-300 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" strokeWidth={1.8} />
              <span className="leading-relaxed">
                {lang === "ar"
                  ? "حماية تامة للخصوصية (Zero-Knowledge): يتم حجب كافة كلمات المرور، التوكنات، والمفاتيح في النصوص محلياً واستبدالها بعلامات مثل {{S1}} قبل إرسالها إلى النموذج، ثم إعادة استبدالها بأمان على جهازك بعد التصنيف."
                  : "Zero-Knowledge Protection: Secret values are locally redacted with {{S1}} placeholders before transmission, and securely restored on your machine after structuring."}
              </span>
            </div>

            {!extractedItems ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-text-secondary">
                      {lang === "ar"
                        ? "الصق النص غير المنظم (إيميل ترحيبي، مفاتيح API، إعدادات سيرفر، أو .env)"
                        : "Paste unstructured text, onboarding email, API config, or .env"}
                    </label>
                  </div>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={`DATABASE_URL=postgres://user:pass@localhost:5432/mydb\nAWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nSTRIPE_KEY=sk_live_51...`}
                    rows={5}
                    className="w-full p-3 text-xs font-mono bg-canvas-950 border border-border rounded-xl text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-cyan-500 resize-none leading-relaxed"
                    dir="ltr"
                  />
                </div>

                {/* Multimodal Vision Dropzone & Paste Area */}
                {supportsVision ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-text-secondary flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{lang === "ar" ? "إرفاق لقطات شاشة أو صور (اختياري):" : "Attach Screenshots or Images (Optional):"}</span>
                      </span>
                      <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20">
                        {lang === "ar" ? "يدعم اللصق المباشر بالحافظة Ctrl+V" : "Ctrl+V paste supported"}
                      </span>
                    </div>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          for (let i = 0; i < e.dataTransfer.files.length; i++) {
                            handleProcessImageFile(e.dataTransfer.files[i]);
                          }
                        }
                      }}
                      onClick={() => document.getElementById("smart-import-file-input")?.click()}
                      className={`p-3.5 rounded-xl border border-dashed transition-all cursor-pointer text-center ${
                        isDragging
                          ? "border-cyan-400 bg-cyan-950/30 scale-[1.01]"
                          : "border-border hover:border-cyan-500/50 bg-canvas-950/50 hover:bg-canvas-900/30"
                      }`}
                    >
                      <input
                        id="smart-import-file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            for (let i = 0; i < e.target.files.length; i++) {
                              handleProcessImageFile(e.target.files[i]);
                            }
                          }
                        }}
                      />
                      <div className="flex items-center justify-center gap-2 text-xs text-text-secondary">
                        <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>
                          {lang === "ar"
                            ? "اسحب وأفلت لقطات الشاشة هنا، أو اضغط للاختيار — أو الصقها بالحافظة (Ctrl+V)"
                            : "Drop screenshots here, click to browse, or paste with Ctrl+V"}
                        </span>
                      </div>
                    </div>

                    {/* Attached Images Thumbnails */}
                    {attachedImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {attachedImages.map((img) => (
                          <div
                            key={img.id}
                            className="relative group flex items-center gap-2 p-1.5 pe-2.5 rounded-xl bg-canvas-900 border border-border text-xs shadow-sm"
                          >
                            <img
                              src={img.dataUrl}
                              alt={img.name}
                              className="w-9 h-9 rounded-lg object-cover border border-border shrink-0 bg-black/20"
                            />
                            <div className="min-w-0 max-w-[140px]">
                              <p className="text-[11px] font-medium text-text-primary truncate">{img.name}</p>
                              <p className="text-[9px] text-text-muted font-mono">{img.size}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeAttachedImage(img.id); }}
                              className="ms-1 p-1 rounded-md text-text-muted hover:text-rose-400 hover:bg-canvas-800 transition-colors"
                              title={lang === "ar" ? "إزالة الصورة" : "Remove"}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-canvas-950 border border-border text-[11px] text-text-muted flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400">ℹ️</span>
                      <span>
                        {lang === "ar"
                          ? "المزود المختار نصي فقط. لرفع وقراءة لقطات الشاشة، اختر مزوداً يدعم الرؤية (Vision) من القائمة أعلاه."
                          : "Selected provider is text-only. Choose a vision-capable provider above to attach screenshots."}
                      </span>
                    </div>
                  </div>
                )}

                {/* Preview tokens / placeholders if user ran preview */}
                {previewData && (
                  <div className="p-3 rounded-xl bg-canvas-950 border border-border space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text-primary">
                        {lang === "ar"
                          ? `القيم السرية المنقحة محلياً (${previewData.placeholders_count || 0}):`
                          : `Locally Redacted Secrets (${previewData.placeholders_count || 0}):`}
                      </span>
                      {previewData.is_pure_env && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {lang === "ar" ? "تحليل محلي فوري بدون استدعاء سحابي" : "Parsed locally without calling LLM"}
                        </span>
                      )}
                    </div>
                    {previewData.placeholders && previewData.placeholders.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {previewData.placeholders.map((tok, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono text-[11px] border border-cyan-500/20"
                          >
                            {tok}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-text-muted text-[11px]">
                        {lang === "ar"
                          ? "جاهز للاستخراج والتصنيف الآلي."
                          : "Ready for structured extraction."}
                      </p>
                    )}
                  </div>
                )}

                {/* Slowness warning tip */}
                {elapsedSec > 10 && aiLoading && (
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between animate-fade-in">
                    <span className="leading-relaxed">
                      {lang === "ar"
                        ? "المزود السحابي يستغرق وقتاً غير معتاد. يمكنك إلغاء الطلب والتجربة باستخدام Antigravity CLI المحلي فائق السرعة."
                        : "Cloud provider is taking longer than usual. You can cancel and try the local Antigravity CLI."}
                    </span>
                  </div>
                )}

                {/* Extraction Error Fallback Card */}
                {extractionError && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs space-y-2 animate-fade-in">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{extractionError}</p>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-rose-500/20">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProviderId("builtin_agy_cli");
                          handleAiRun("builtin_agy_cli");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>{lang === "ar" ? "⚡ إعادة المحاولة باستخدام Antigravity CLI المحلي" : "⚡ Retry with Local Antigravity CLI"}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Processing Indicator */}
                {aiLoading && (
                  <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 text-xs flex items-center justify-between animate-fade-in">
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin shrink-0" />
                      <span>
                        {selectedProviderId === "builtin_agy_cli"
                          ? (lang === "ar" ? "⚡ جاري التحليل المحلي عبر Antigravity CLI (آمن وسريع وبدون إنترنت)..." : "⚡ Local extraction via Antigravity CLI (fast & zero-knowledge)...")
                          : (lang === "ar" ? "جاري الاتصال بمزود الذكاء الاصطناعي وتحليل البيانات..." : "Connecting to AI Provider and extracting...")}
                      </span>
                    </div>
                    <span className="font-mono text-cyan-400 text-xs font-semibold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/20">{elapsedSec}s</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  {aiLoading && (
                    <button
                      type="button"
                      onClick={handleAbortAiRun}
                      className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-medium transition-colors"
                    >
                      {lang === "ar" ? "إلغاء المعالجة" : "Cancel"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleAiPreview}
                    disabled={!rawText.trim() || aiLoading}
                    className="px-3.5 py-2 rounded-xl bg-canvas-850 hover:bg-canvas-800 border border-border text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {lang === "ar" ? "معاينة التنقيح" : "Preview Redaction"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAiRun()}
                    disabled={(!rawText.trim() && attachedImages.length === 0) || aiLoading}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-600/20 disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{lang === "ar" ? `جاري الاستخراج... (${elapsedSec}ث)` : `Extracting... (${elapsedSec}s)`}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{lang === "ar" ? "استخراج وتصنيف الأسرار" : "Extract & Classify"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Step 3: Review Extracted Items */
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-primary">
                    {lang === "ar"
                      ? `العناصر المكتشفة (${extractedItems.length}):`
                      : `Extracted Items (${extractedItems.length}):`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtractedItems(null)}
                    className="text-text-muted hover:text-text-primary transition-colors text-[11px]"
                  >
                    {lang === "ar" ? "← العودة للنص الأصلي" : "← Back to Text"}
                  </button>
                </div>

                <div className="max-h-[55vh] overflow-y-auto space-y-3 custom-scrollbar pr-0.5">
                  {extractedItems.map((item, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-canvas-950 border border-border text-xs space-y-3 shadow-sm">
                      {/* Item Title & Fields Count */}
                      <div className="flex items-center justify-between font-semibold text-text-primary">
                        <div className="flex items-center gap-2 flex-1 mr-2">
                          <input
                            type="text"
                            value={item.title || ""}
                            onChange={(e) => updateItem(idx, "title", e.target.value)}
                            className="text-sm font-semibold text-cyan-300 bg-transparent border-b border-transparent hover:border-border focus:border-cyan-500 focus:outline-none transition-colors px-1 py-0.5 rounded w-full max-w-[280px]"
                            placeholder={lang === "ar" ? "عنوان العنصر..." : "Item title..."}
                          />
                          {item.template_hint && (
                            <span className="text-[10px] text-brand-400 font-mono px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 shrink-0">
                              {item.template_hint}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-muted font-mono px-2 py-0.5 rounded bg-canvas-900 border border-border shrink-0">
                          {item.fields?.length || 0} {lang === "ar" ? "حقول" : "fields"}
                        </span>
                      </div>

                      {/* Fields List */}
                      <div className="space-y-1.5 pt-1">
                        {item.fields?.map((f, fIdx) => (
                          <div key={fIdx} className="flex items-center justify-between text-[11px] bg-canvas-900/60 px-2.5 py-1.5 rounded-lg border border-border/40">
                            <div className="flex items-center gap-2">
                              <span className="text-text-secondary font-medium">{f.label}</span>
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-canvas-800 text-text-muted font-mono">
                                {f.type}
                              </span>
                            </div>
                            <span className="font-mono text-text-muted truncate max-w-[240px]" dir="ltr">
                              {f.is_secret ? "••••••••••••••••" : String(f.value || "")}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Collapsible Organization Options (Project, Category, Tags, Rotation, Notes) */}
                      <div className="rounded-xl border border-border/80 bg-canvas-900/30 overflow-hidden mt-2">
                        <button
                          type="button"
                          onClick={() => toggleItemAdvanced(idx)}
                          className="w-full flex items-center justify-between p-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-900 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.8} />
                            <span className="font-medium text-text-primary">
                              {lang === "ar" ? "خيارات المشروع والتنظيم (اختياري)" : "Project & Organization Options (Optional)"}
                            </span>
                            {(item.projectId || item.isNewProject || item.categoryId || item.isNewCategory || item.rotationDays) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            )}
                          </div>
                          {item.showAdvanced ? (
                            <ChevronUp className="w-4 h-4 text-text-muted" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-text-muted" />
                          )}
                        </button>

                        {item.showAdvanced && (
                          <div className="p-3 pt-1 border-t border-border/60 space-y-3 bg-canvas-950/80 animate-fade-in">
                            {/* Project & Category row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Project */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-text-secondary block">
                                  {lang === "ar" ? "المشروع" : "Project"}
                                </label>
                                <select
                                  value={item.isNewProject ? "__NEW__" : (item.projectId || "")}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "__NEW__") {
                                      updateItem(idx, "isNewProject", true);
                                      updateItem(idx, "projectId", "");
                                    } else {
                                      updateItem(idx, "isNewProject", false);
                                      updateItem(idx, "projectId", val);
                                    }
                                  }}
                                  className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500"
                                >
                                  <option value="">{lang === "ar" ? "بدون مشروع" : "None"}</option>
                                  {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.payload?.name}
                                    </option>
                                  ))}
                                  <option value="__NEW__">
                                    {lang === "ar" ? "+ إنشاء مشروع جديد..." : "+ Create New Project..."}
                                  </option>
                                </select>
                                {item.isNewProject && (
                                  <input
                                    type="text"
                                    value={item.newProjectName}
                                    onChange={(e) => updateItem(idx, "newProjectName", e.target.value)}
                                    placeholder={lang === "ar" ? "اسم المشروع الجديد..." : "New project name..."}
                                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-cyan-500/50 rounded-lg text-text-primary focus:outline-none focus:border-cyan-500 mt-1"
                                    autoFocus
                                  />
                                )}
                              </div>

                              {/* Category */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-text-secondary block">
                                  {lang === "ar" ? "التصنيف" : "Category"}
                                </label>
                                <select
                                  value={item.isNewCategory ? "__NEW__" : (item.categoryId || "")}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "__NEW__") {
                                      updateItem(idx, "isNewCategory", true);
                                      updateItem(idx, "categoryId", "");
                                    } else {
                                      updateItem(idx, "isNewCategory", false);
                                      updateItem(idx, "categoryId", val);
                                    }
                                  }}
                                  className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500"
                                >
                                  <option value="">{lang === "ar" ? "بدون تصنيف" : "None"}</option>
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.payload?.name}
                                    </option>
                                  ))}
                                  <option value="__NEW__">
                                    {lang === "ar" ? "+ إنشاء تصنيف جديد..." : "+ Create New Category..."}
                                  </option>
                                </select>
                                {item.isNewCategory && (
                                  <input
                                    type="text"
                                    value={item.newCategoryName}
                                    onChange={(e) => updateItem(idx, "newCategoryName", e.target.value)}
                                    placeholder={lang === "ar" ? "اسم التصنيف الجديد..." : "New category name..."}
                                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-cyan-500/50 rounded-lg text-text-primary focus:outline-none focus:border-cyan-500 mt-1"
                                    autoFocus
                                  />
                                )}
                              </div>
                            </div>

                            {/* Tags & Rotation Days row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Tags */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                                  <Tag className="w-3 h-3 text-text-muted" />
                                  <span>{lang === "ar" ? "الوسوم (مفصولة بفاصلة)" : "Tags (comma separated)"}</span>
                                </label>
                                <input
                                  type="text"
                                  value={item.tagsStr || ""}
                                  onChange={(e) => updateItem(idx, "tagsStr", e.target.value)}
                                  placeholder="subscription, pdf, personal"
                                  className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500 font-mono"
                                />
                                {item.tagsStr && (
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {item.tagsStr.split(",").map((t, tIdx) => {
                                      const cleanT = t.trim();
                                      if (!cleanT) return null;
                                      return (
                                        <span
                                          key={tIdx}
                                          className="px-1.5 py-0.5 rounded bg-canvas-800 text-cyan-400 text-[10px] font-mono border border-border"
                                        >
                                          #{cleanT}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Rotation Days */}
                              <div className="space-y-1">
                                <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-text-muted" />
                                  <span>{lang === "ar" ? "التدوير الدوري (أيام)" : "Key Rotation (Days)"}</span>
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={item.rotationDays || ""}
                                  onChange={(e) => updateItem(idx, "rotationDays", e.target.value)}
                                  placeholder="90"
                                  className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500 font-mono"
                                />
                                {item.rotationDays && (
                                  <span className="text-[10px] text-text-muted block">
                                    {lang === "ar"
                                      ? `تنبيه التدوير بعد ${item.rotationDays} يوماً`
                                      : `Rotate/renew after ${item.rotationDays} days`}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Encrypted Notes (description) */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-text-secondary block">
                                {lang === "ar" ? "الملاحظات المشفرة" : "Encrypted Notes"}
                              </label>
                              <textarea
                                rows={3}
                                value={item.description || ""}
                                onChange={(e) => updateItem(idx, "description", e.target.value)}
                                placeholder={lang === "ar" ? "ملاحظات إضافية مشفرة محلياً..." : "Additional locally encrypted notes..."}
                                className="w-full p-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500 resize-none leading-relaxed"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleAiCommit}
                    disabled={aiLoading}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-cyan-600/20 disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{lang === "ar" ? "تأكيد وحفظ في الخزنة" : "Confirm & Save to Vault"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Bitwarden JSON */}
        {activeTab === "bitwarden" && (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-canvas-950 border border-border text-xs text-text-muted leading-relaxed">
              {lang === "ar"
                ? "قم بتصدير الخزنة من تطبيق Bitwarden بصيغة (Bitwarden JSON - unencrypted)، ثم ارفع الملف هنا لتحويل العناصر آلياً."
                : "Export your vault from Bitwarden as 'Bitwarden JSON (unencrypted)' and upload the file below for automatic conversion."}
            </div>

            <div className="space-y-2">
              <input
                type="file"
                accept=".json"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-canvas-800 file:text-text-primary hover:file:bg-canvas-700 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => handleFileUpload("bitwarden_json")}
                disabled={!file || fileLoading}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50"
              >
                {fileLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>{lang === "ar" ? "بدء استيراد Bitwarden" : "Import Bitwarden"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: CSV File */}
        {activeTab === "csv" && (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-canvas-950 border border-border text-xs text-text-muted leading-relaxed">
              {lang === "ar"
                ? "استيراد مباشر من ملف CSV يحتوي على الأعمدة (title, username, password, url, notes)."
                : "Direct import from a standard CSV file with columns (title, username, password, url, notes)."}
            </div>

            <div className="space-y-2">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-medium file:bg-canvas-800 file:text-text-primary hover:file:bg-canvas-700 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => handleFileUpload("csv")}
                disabled={!file || fileLoading}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50"
              >
                {fileLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>{lang === "ar" ? "بدء استيراد CSV" : "Import CSV"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
