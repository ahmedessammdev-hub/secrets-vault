import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import { Download, Copy, Check, AlertTriangle, Eye, EyeOff } from "lucide-react";

export function EnvExportModal({ projectId, onClose }) {
  const { lang, projects, showToast } = useVault();
  const [selectedProj, setSelectedProj] = useState(projectId || (projects[0]?.id || ""));
  const [envName, setEnvName] = useState("production");
  const [envContent, setEnvContent] = useState("");
  const [masked, setMasked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchEnv() {
      if (!selectedProj) return;
      setLoading(true);
      try {
        const res = await api(`/projects/${selectedProj}/env?env=${envName}`);
        setEnvContent(res.env_content || "");
      } catch (err) {
        showToast(err.message || (lang === "ar" ? "تعذر جلب ملف .env" : "Failed to load .env content"), "error");
      } finally {
        setLoading(false);
      }
    }
    fetchEnv();
  }, [selectedProj, envName, lang, showToast]);

  const displayContent = masked
    ? envContent
        .split("\n")
        .map((line) => {
          if (!line.includes("=") || line.trim().startsWith("#")) return line;
          const [key] = line.split("=");
          return `${key}=••••••••••••••••`;
        })
        .join("\n")
    : envContent;

  async function handleCopy() {
    if (!envContent) return;
    try {
      await navigator.clipboard.writeText(envContent);
      setCopied(true);
      showToast(lang === "ar" ? "تم نسخ متغيرات البيئة إلى الحافظة" : "Copied .env to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      showToast("Copy failed", "error");
    }
  }

  function handleDownload() {
    if (!envContent) return;
    const blob = new Blob([envContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const projName = projects.find((p) => p.id === selectedProj)?.payload?.name || "project";
    a.href = url;
    a.download = `.env.${projName.toLowerCase().replace(/\s+/g, "-")}.${envName}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(lang === "ar" ? "تم تنزيل ملف .env" : "Downloaded .env file", "success");
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "تصدير متغيرات البيئة (.env)" : "Export Environment (.env)"}
      subtitle={lang === "ar" ? "توليد ملف إعدادات صالح للاستخدام المباشر في الخوادم ومشاريع التطوير" : "Generate production or local configuration files"}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">
              {lang === "ar" ? "المشروع" : "Project"}
            </label>
            <select
              value={selectedProj}
              onChange={(e) => setSelectedProj(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-canvas-950 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.payload?.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">
              {lang === "ar" ? "بيئة العمل" : "Target Environment"}
            </label>
            <div className="flex rounded-xl bg-canvas-950 p-1 border border-border">
              {["production", "staging", "development"].map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setEnvName(env)}
                  className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${
                    envName === env
                      ? "bg-canvas-800 text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Warning */}
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
          <span>
            {lang === "ar"
              ? "تحذير أمني: تصدير .env ينتج أسراراً نصية غير مشفرة. لا تقم برفع هذا الملف إلى Git أو مستودعات عامة."
              : "Security Warning: .env export contains unencrypted plaintext credentials. Do not commit this to public version control."}
          </span>
        </div>

        {/* Preview Area */}
        <div className="relative">
          <div className="flex items-center justify-between px-3 py-1.5 bg-canvas-950 border-t border-x border-border rounded-t-xl text-[11px] text-text-muted">
            <span>.env.{envName}</span>
            <button
              type="button"
              onClick={() => setMasked(!masked)}
              className="flex items-center gap-1 hover:text-text-primary transition-colors"
            >
              {masked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{masked ? (lang === "ar" ? "إظهار الأسرار" : "Reveal") : (lang === "ar" ? "حجب الأسرار" : "Mask")}</span>
            </button>
          </div>
          <textarea
            readOnly
            value={loading ? (lang === "ar" ? "جاري التوليد..." : "Generating...") : displayContent}
            className="w-full h-48 p-3 text-xs bg-canvas-950/80 border border-border rounded-b-xl text-text-primary font-mono custom-scrollbar focus:outline-none resize-none leading-relaxed"
            dir="ltr"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!envContent || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-canvas-800 hover:bg-canvas-700 text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ الكل" : "Copy")}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!envContent || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-canvas-800 hover:bg-canvas-700 text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "تنزيل الملف" : "Download File"}</span>
            </button>
          </div>

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
