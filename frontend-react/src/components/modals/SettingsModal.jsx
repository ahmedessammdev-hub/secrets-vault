import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import {
  Download,
  Upload,
  Cloud,
  KeyRound,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Bot,
  Terminal,
  Cpu,
  Check,
  XCircle,
  Plus,
  Trash2,
  Edit3,
  Image as ImageIcon,
  ChevronRight,
  LayoutGrid,
  ExternalLink,
  Zap,
} from "lucide-react";

export function SettingsModal({ onClose, initialTab = "backup" }) {
  const {
    lang,
    autoLockMinutes,
    setAutoLockMinutes,
    templates,
    loadVaultData,
    checkStatus,
    showToast,
  } = useVault();

  const [activeTab, setActiveTab] = useState(initialTab); // backup | drive | agy | llm | templates | security

  // Backup State
  const [importFile, setImportFile] = useState(null);
  const [importPassword, setImportPassword] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  // Drive OAuth State
  const [driveStatus, setDriveStatus] = useState(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveClientId, setDriveClientId] = useState("");
  const [driveClientSecret, setDriveClientSecret] = useState("");
  const [driveSavingCreds, setDriveSavingCreds] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [showDriveSecret, setShowDriveSecret] = useState(false);

  // Antigravity CLI State
  const [agyStatus, setAgyStatus] = useState(null);
  const [agyLoading, setAgyLoading] = useState(false);
  const [agyTestResult, setAgyTestResult] = useState(null);

  // Change Password State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newHint, setNewHint] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);

  // LLM Multi-Provider State
  const [providers, setProviders] = useState([]);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [isAddingProvider, setIsAddingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({
    id: null,
    title: "OpenAI GPT-4o",
    backend_type: "openai_compat",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o",
    api_key: "",
    supports_vision: true,
    raw_mode: false,
    timeout: 60,
    set_as_active: true,
  });
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [testLoadingId, setTestLoadingId] = useState(null);
  const [testFormLoading, setTestFormLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const dRes = await api("/drive/status");
        setDriveStatus(dRes);
      } catch (e) {}

      try {
        const cRes = await api("/drive/oauth/config");
        if (cRes?.client_id) setDriveClientId(cRes.client_id);
      } catch (e) {}

      try {
        const agyRes = await api("/llm/agy/status");
        setAgyStatus(agyRes);
      } catch (e) {}

      try {
        const pRes = await api("/llm/providers");
        if (pRes) {
          setProviders(pRes.providers || []);
          setActiveProviderId(pRes.active_id || "");
        }
      } catch (e) {}
    }
    loadData();

    function onMessage(e) {
      if (e.data?.type === "GOOGLE_DRIVE_CONNECTED") {
        showToast(lang === "ar" ? `تم ربط Google Drive بنجاح: ${e.data.email}` : `Connected to Google Drive: ${e.data.email}`, "success");
        api("/drive/status").then(setDriveStatus).catch(() => {});
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [lang]);

  // Export Encrypted .vault
  async function handleExportVault() {
    setBackupLoading(true);
    try {
      const resp = await api("/backup/export");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `secrets-vault-backup-${new Date().toISOString().slice(0, 10)}.vault`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast(lang === "ar" ? "تم تصدير النسخة الاحتياطية بنجاح" : "Encrypted backup exported successfully", "success");
      await checkStatus();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "فشل التصدير" : "Export failed"), "error");
    } finally {
      setBackupLoading(false);
    }
  }

  // Export Plaintext JSON
  async function handleExportPlaintext() {
    if (
      !window.confirm(
        lang === "ar"
          ? "تحذير أمني شديد الخطورة: سيتم تصدير جميع أسرارك وكلمات مرورك في ملف نصي غير مشفر. هل ترغب بالاستمرار؟"
          : "Critical Warning: Unencrypted export writes ALL passwords and API keys in plain text JSON. Continue?"
      )
    ) {
      return;
    }

    try {
      const resp = await api("/backup/export-unencrypted?confirm_unencrypted=true&format_type=json");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vault-plaintext-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast(lang === "ar" ? "تم تصدير الملف غير المشفر" : "Unencrypted JSON exported", "warning");
    } catch (err) {
      showToast(err.message || "Failed unencrypted export", "error");
    }
  }

  // Import .vault
  async function handleImportVault(e) {
    e.preventDefault();
    if (!importFile || !importPassword) return;

    setBackupLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("password", importPassword);
      formData.append("confirm_overwrite", confirmOverwrite ? "true" : "false");

      await api("/backup/import", {
        method: "POST",
        body: formData,
      });

      showToast(lang === "ar" ? "تمت استعادة الخزنة بنجاح!" : "Vault restored successfully!", "success");
      setImportFile(null);
      setImportPassword("");
      await checkStatus();
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "فشلت استعادة الخزنة" : "Import failed"), "error");
    } finally {
      setBackupLoading(false);
    }
  }

  // Save Google Cloud OAuth Credentials
  async function handleSaveDriveCredentials(e) {
    e?.preventDefault();
    if (!driveClientId.trim() || !driveClientSecret.trim()) {
      showToast(lang === "ar" ? "يرجى إدخال Client ID و Client Secret" : "Please enter Client ID and Client Secret", "warning");
      return;
    }
    setDriveSavingCreds(true);
    try {
      await api("/drive/oauth/config", {
        method: "POST",
        body: { client_id: driveClientId.trim(), client_secret: driveClientSecret.trim() },
      });
      showToast(lang === "ar" ? "تم حفظ بيانات اعتماد Google Cloud بنجاح!" : "Credentials saved successfully!", "success");
      setDriveClientSecret("");
      const st = await api("/drive/status");
      setDriveStatus(st);
    } catch (err) {
      showToast(err.message || "Failed to save credentials", "error");
    } finally {
      setDriveSavingCreds(false);
    }
  }

  // Initiate Google OAuth in Browser Window
  async function handleInitiateDriveOAuth() {
    setDriveConnecting(true);
    try {
      const res = await api("/drive/oauth/url?redirect_uri=http://127.0.0.1:8000/drive/oauth/callback");
      if (res?.auth_url) {
        window.open(res.auth_url, "_blank", "width=600,height=750");
        showToast(lang === "ar" ? "تم فتح نافذة تسجيل الدخول بجوجل..." : "Google sign-in opened in browser...", "info");
      }
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "يرجى حفظ بيانات الاعتماد أولاً" : "Please save credentials first"), "error");
    } finally {
      setDriveConnecting(false);
    }
  }

  // Disconnect Google Drive
  async function handleDisconnectDrive() {
    setDriveLoading(true);
    try {
      await api("/drive/disconnect", { method: "POST" });
      showToast(lang === "ar" ? "تم قطع الاتصال بـ Google Drive" : "Disconnected Google Drive", "info");
      const st = await api("/drive/status");
      setDriveStatus(st);
      await checkStatus();
    } catch (err) {
      showToast(err.message || "Drive action failed", "error");
    } finally {
      setDriveLoading(false);
    }
  }

  // Drive Backup Now
  async function handleDriveBackupNow() {
    setDriveLoading(true);
    try {
      const res = await api("/drive/backup-now", { method: "POST" });
      const msg = res.cloud_uploaded
        ? (lang === "ar" ? "تم رفع النسخة المشفرة إلى Google Drive بنجاح!" : "Backed up to Google Drive successfully!")
        : (lang === "ar" ? "تم حفظ النسخة محلياً" : "Saved snapshot locally");
      showToast(msg, "success");
      const st = await api("/drive/status");
      setDriveStatus(st);
      await checkStatus();
    } catch (err) {
      showToast(err.message || "Sync failed", "error");
    } finally {
      setDriveLoading(false);
    }
  }

  // Test Antigravity CLI Ping
  async function handleTestAgy() {
    setAgyLoading(true);
    setAgyTestResult(null);
    try {
      const res = await api("/llm/agy/test", { method: "POST" });
      setAgyTestResult(res);
      showToast(lang === "ar" ? `استجاب Antigravity CLI بنجاح خلال ${res.elapsed_ms}ms!` : `Antigravity CLI pinged in ${res.elapsed_ms}ms!`, "success");
    } catch (err) {
      setAgyTestResult({ success: false, error: err.message || "CLI invocation failed" });
      showToast(err.message || "CLI invocation failed", "error");
    } finally {
      setAgyLoading(false);
    }
  }

  // Set Antigravity CLI as Active Provider
  async function handleSetDefaultAgy() {
    try {
      await api("/llm/providers/builtin_agy_cli/set-active", { method: "POST" });
      setActiveProviderId("builtin_agy_cli");
      await reloadProviders();
      showToast(lang === "ar" ? "تم تعيين Antigravity CLI كمزود افتراضي للاستيراد!" : "Antigravity CLI set as default provider", "success");
    } catch (err) {
      showToast(err.message || "Failed to set default provider", "error");
    }
  }

  // Delete Custom Template
  async function handleDeleteTemplate(tplId, name) {
    if (!window.confirm(lang === "ar" ? `هل أنت متأكد من حذف القالب "${name}"؟` : `Delete template "${name}"?`)) return;
    try {
      await api(`/templates/${tplId}`, { method: "DELETE" });
      showToast(lang === "ar" ? "تم حذف القالب بنجاح" : "Template deleted", "success");
      await loadVaultData();
    } catch (err) {
      showToast(err.message || "Failed to delete template", "error");
    }
  }

  // Multi-Provider Handlers
  async function reloadProviders() {
    try {
      const pRes = await api("/llm/providers");
      if (pRes) {
        setProviders(pRes.providers || []);
        setActiveProviderId(pRes.active_id || "");
      }
    } catch (e) {}
  }

  async function handleSetActiveProvider(id) {
    try {
      await api(`/llm/providers/${id}/set-active`, { method: "POST" });
      setActiveProviderId(id);
      await reloadProviders();
      showToast(lang === "ar" ? "تم تفعيل المزود بنجاح" : "Provider set as active", "success");
    } catch (err) {
      showToast(err.message || "Failed to set active provider", "error");
    }
  }

  async function handleDeleteProvider(id, title) {
    if (!window.confirm(lang === "ar" ? `هل أنت متأكد من حذف المزود "${title}" من الخزنة؟` : `Delete AI Provider "${title}"?`)) {
      return;
    }
    try {
      await api(`/llm/providers/${id}`, { method: "DELETE" });
      await reloadProviders();
      await loadVaultData();
      showToast(lang === "ar" ? "تم حذف المزود من الخزنة" : "Provider deleted", "success");
    } catch (err) {
      showToast(err.message || "Failed to delete provider", "error");
    }
  }

  async function handleTestProvider(provider) {
    setTestLoadingId(provider.id);
    try {
      const res = await api("/llm/providers/test", {
        method: "POST",
        body: { item_id: provider.id },
      });
      showToast(res.message || (lang === "ar" ? "تم الاتصال بالمزود بنجاح!" : "Connected successfully!"), "success");
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر الاتصال بالمزود" : "Connection failed"), "error");
    } finally {
      setTestLoadingId(null);
    }
  }

  async function handleTestFormConfig() {
    setTestFormLoading(true);
    setTestResult(null);
    try {
      const res = await api("/llm/providers/test", {
        method: "POST",
        body: {
          item_id: providerForm.id || undefined,
          backend_type: providerForm.backend_type,
          base_url: providerForm.base_url,
          model: providerForm.model,
          api_key: providerForm.api_key.trim() || undefined,
        },
      });
      setTestResult({ success: true, message: res.message || (lang === "ar" ? "الاتصال بالمزود سليم وجاهز!" : "Connection successful!") });
    } catch (err) {
      setTestResult({ success: false, error: err.message || (lang === "ar" ? "تعذر الاتصال بالمزود" : "Connection failed") });
    } finally {
      setTestFormLoading(false);
    }
  }

  async function handleSaveProvider(e) {
    e?.preventDefault();
    setLlmLoading(true);
    try {
      await api("/llm/providers", {
        method: "POST",
        body: {
          id: providerForm.id || undefined,
          title: providerForm.title.trim(),
          backend_type: providerForm.backend_type,
          base_url: providerForm.base_url.trim(),
          model: providerForm.model.trim(),
          api_key: providerForm.api_key.trim() ? providerForm.api_key.trim() : (providerForm.id ? "__KEEP__" : ""),
          supports_vision: providerForm.supports_vision,
          raw_mode: providerForm.raw_mode,
          timeout: parseInt(providerForm.timeout, 10) || 60,
          set_as_active: providerForm.set_as_active,
        },
      });
      await reloadProviders();
      await loadVaultData();
      setIsAddingProvider(false);
      setTestResult(null);
      showToast(lang === "ar" ? "تم حفظ المزود في مشروع AI Models بنجاح" : "Provider saved to AI Models project", "success");
    } catch (err) {
      showToast(err.message || "Failed to save AI provider", "error");
    } finally {
      setLlmLoading(false);
    }
  }

  function openAddProvider() {
    setProviderForm({
      id: null,
      title: "OpenAI GPT-4o",
      backend_type: "openai_compat",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4o",
      api_key: "",
      supports_vision: true,
      raw_mode: false,
      timeout: 60,
      set_as_active: providers.length === 0,
    });
    setTestResult(null);
    setIsAddingProvider(true);
  }

  function openEditProvider(p) {
    setProviderForm({
      id: p.id,
      title: p.title,
      backend_type: p.backend_type,
      base_url: p.base_url,
      model: p.model,
      api_key: "",
      supports_vision: p.supports_vision,
      raw_mode: p.raw_mode,
      timeout: p.timeout || 60,
      set_as_active: p.is_active,
    });
    setTestResult(null);
    setIsAddingProvider(true);
  }

  const PRESETS = [
    {
      id: "openai",
      label: "OpenAI GPT-4o",
      icon: Sparkles,
      vision: true,
      config: {
        title: "OpenAI GPT-4o",
        backend_type: "openai_compat",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o",
        supports_vision: true,
        raw_mode: false,
      },
    },
    {
      id: "groq",
      label: "Groq LLaMA 3.3",
      icon: Cpu,
      vision: false,
      config: {
        title: "Groq LLaMA 3.3",
        backend_type: "openai_compat",
        base_url: "https://api.groq.com/openai/v1",
        model: "llama-3.3-70b-versatile",
        supports_vision: false,
        raw_mode: false,
      },
    },
    {
      id: "ollama",
      label: "Ollama LLaVA",
      icon: Eye,
      vision: true,
      config: {
        title: "Ollama LLaVA (Local)",
        backend_type: "openai_compat",
        base_url: "http://localhost:11434/v1",
        model: "llava",
        supports_vision: true,
        raw_mode: true,
      },
    },
    {
      id: "deepseek",
      label: "DeepSeek V3",
      icon: Bot,
      vision: false,
      config: {
        title: "DeepSeek Chat",
        backend_type: "openai_compat",
        base_url: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        supports_vision: false,
        raw_mode: false,
      },
    },
    {
      id: "agy",
      label: "Antigravity CLI",
      icon: Terminal,
      vision: false,
      config: {
        title: "Antigravity CLI",
        backend_type: "agy_cli",
        base_url: "",
        model: "agy",
        supports_vision: false,
        raw_mode: false,
      },
    },
  ];

  function applyPreset(preset) {
    setProviderForm((prev) => ({
      ...prev,
      ...preset.config,
    }));
  }

  // Change Password
  async function handleChangePassword(e) {
    e.preventDefault();
    if (!oldPassword || !newPassword) return;
    if (newPassword !== confirmNewPassword) {
      showToast(lang === "ar" ? "كلمات المرور الجديدة غير متطابقة" : "Passwords do not match", "error");
      return;
    }

    setPassLoading(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: {
          old_password: oldPassword,
          new_password: newPassword,
          password_hint: newHint || null,
        },
      });
      showToast(lang === "ar" ? "تم تغيير كلمة المرور الرئيسية وإعادة تشفير المفاتيح" : "Master password updated successfully", "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNewHint("");
      onClose();
    } catch (err) {
      showToast(err.message || "Failed to change password", "error");
    } finally {
      setPassLoading(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "إعدادات الخزنة والذكاء الاصطناعي" : "Vault Settings & AI Assistant"}
      subtitle={lang === "ar" ? "إدارة النسخ الاحتياطي، المساعد الذكي، المزامنة، والأمان" : "Manage local backups, AI assistant, sync, and security"}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-canvas-950 p-1 border border-border overflow-x-auto">
          {[
            { id: "backup", label: lang === "ar" ? "النسخ الاحتياطي" : "Backup & Restore", icon: Download },
            { id: "drive", label: lang === "ar" ? "Google Drive" : "Google Drive", icon: Cloud },
            { id: "agy", label: lang === "ar" ? "Antigravity CLI" : "Antigravity CLI", icon: Terminal, highlight: true },
            { id: "llm", label: lang === "ar" ? "المزودات السحابية" : "Cloud AI", icon: Bot },
            { id: "templates", label: lang === "ar" ? "القوالب" : "Templates", icon: LayoutGrid },
            { id: "security", label: lang === "ar" ? "الأمان والقفل" : "Security", icon: KeyRound },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[90px] py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  isActive
                    ? tab.highlight
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-sm"
                      : "bg-canvas-800 text-brand-400 shadow-sm"
                    : tab.highlight
                    ? "text-emerald-400/80 hover:text-emerald-300"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.highlight ? "text-emerald-400" : ""}`} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Backup & Restore */}
        {activeTab === "backup" && (
          <div className="space-y-5">
            {/* Export Section */}
            <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <h4 className="text-xs font-semibold text-text-primary">
                {lang === "ar" ? "تصدير نسخة احتياطية مشفرة (.vault)" : "Export Encrypted Backup (.vault)"}
              </h4>
              <p className="text-xs text-text-muted leading-relaxed">
                {lang === "ar"
                  ? "ملف النسخ الاحتياطي مشفر بنفس مفتاح الخزنة وقواعد Argon2id. يمكنك حفظه في وحدة تخزين خارجية بأمان تام."
                  : "Encrypted using your vault master key and Argon2id. Safe to store anywhere."}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportVault}
                  disabled={backupLoading}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{lang === "ar" ? "تصدير الخزنة الآن" : "Export .vault File"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPlaintext}
                  className="px-3 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 text-xs font-medium transition-colors"
                >
                  {lang === "ar" ? "تصدير JSON غير مشفر (تحذير)" : "Plaintext JSON Export"}
                </button>
              </div>
            </div>

            {/* Import Section */}
            <form onSubmit={handleImportVault} className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <h4 className="text-xs font-semibold text-text-primary">
                {lang === "ar" ? "استعادة من ملف (.vault)" : "Restore from (.vault) File"}
              </h4>
              <p className="text-xs text-text-muted leading-relaxed">
                {lang === "ar"
                  ? "سيتم استبدال محتويات الخزنة الحالية بالبيانات المستوردة بعد فك تشفيرها بنجاح."
                  : "Restore items from a previously exported backup file."}
              </p>

              <div className="space-y-2 pt-1">
                <input
                  type="file"
                  accept=".vault,.json"
                  onChange={(e) => setImportFile(e.target.files[0] || null)}
                  className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-canvas-850 file:text-text-primary hover:file:bg-canvas-800"
                />

                <input
                  type="password"
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  placeholder={lang === "ar" ? "كلمة المرور الخاصة بالملف المستورد..." : "Backup master password..."}
                  className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                />

                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={confirmOverwrite}
                    onChange={(e) => setConfirmOverwrite(e.target.checked)}
                    className="rounded border-border bg-canvas-900 text-brand-600 focus:ring-0"
                  />
                  <span>
                    {lang === "ar"
                      ? "أؤكد رغبتي في استبدال عناصر الخزنة الحالية"
                      : "I confirm overwriting existing vault contents"}
                  </span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!importFile || !importPassword || !confirmOverwrite || backupLoading}
                  className="px-4 py-2 rounded-xl bg-canvas-850 hover:bg-canvas-800 border border-border text-text-primary text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{lang === "ar" ? "بدء استعادة النسخة الاحتياطية" : "Start Restore"}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Google Drive OAuth 2.0 */}
        {activeTab === "drive" && (
          <div className="space-y-4">
            {/* Step 1: Google Cloud Credentials */}
            <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-brand-400" />
                  <h4 className="text-xs font-semibold text-text-primary">
                    {lang === "ar" ? "1. بيانات اعتماد Google Cloud Console (OAuth 2.0)" : "1. Google Cloud OAuth 2.0 Credentials"}
                  </h4>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  driveStatus?.configured
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                }`}>
                  {driveStatus?.configured ? (lang === "ar" ? "تم الضبط" : "Configured") : (lang === "ar" ? "مطلوب الإدخال" : "Needs Setup")}
                </span>
              </div>

              <p className="text-[11px] text-text-muted leading-relaxed">
                {lang === "ar"
                  ? "لربط حساب Google Drive بأمان، أدخل Client ID و Client Secret من Google Cloud Console (نوع Web Application مع Redirect URI: http://127.0.0.1:8000/drive/oauth/callback). تحفظ البيانات مشفرة محلياً."
                  : "Enter your Google Cloud OAuth 2.0 Client ID and Secret (Web Application type with Redirect URI http://127.0.0.1:8000/drive/oauth/callback)."}
              </p>

              <form onSubmit={handleSaveDriveCredentials} className="space-y-2 pt-1">
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">Client ID:</label>
                  <input
                    type="text"
                    value={driveClientId}
                    onChange={(e) => setDriveClientId(e.target.value)}
                    placeholder="xxxx-xxxxxxxx.apps.googleusercontent.com"
                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-text-secondary">Client Secret:</label>
                    <button
                      type="button"
                      onClick={() => setShowDriveSecret(!showDriveSecret)}
                      className="text-[11px] text-text-muted hover:text-text-primary flex items-center gap-1"
                    >
                      {showDriveSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showDriveSecret ? (lang === "ar" ? "إخفاء" : "Hide") : (lang === "ar" ? "إظهار" : "Show")}</span>
                    </button>
                  </div>
                  <input
                    type={showDriveSecret ? "text" : "password"}
                    value={driveClientSecret}
                    onChange={(e) => setDriveClientSecret(e.target.value)}
                    placeholder={driveStatus?.configured ? (lang === "ar" ? "•••••••••••••••• (محفوظ مسبقاً - أدخل لتحديثه)" : "•••••••••••••••• (Already configured)") : "GOCSPX-xxxxxxxx"}
                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={driveSavingCreds || !driveClientId.trim()}
                  className="px-3.5 py-1.5 rounded-lg bg-canvas-850 hover:bg-canvas-800 border border-border text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {driveSavingCreds ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : (lang === "ar" ? "حفظ بيانات الاعتماد المشفرة" : "Save Credentials")}
                </button>
              </form>
            </div>

            {/* Step 2: Sign In & Sync */}
            <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-brand-400" />
                  <h4 className="text-xs font-semibold text-text-primary">
                    {lang === "ar" ? "2. الاتصال والحساب المرتبط" : "2. Connection & Authorization"}
                  </h4>
                </div>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  driveStatus?.connected
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-canvas-900 border-border text-text-muted"
                }`}>
                  {driveStatus?.connected
                    ? (lang === "ar" ? `متصل (${driveStatus.account_email || "Active"})` : `Connected (${driveStatus.account_email || "Active"})`)
                    : (lang === "ar" ? "غير متصل" : "Disconnected")}
                </span>
              </div>

              <p className="text-xs text-text-muted leading-relaxed">
                {lang === "ar"
                  ? "يتم رفع النسخ الاحتياطية المشفرة بـ Zero-Knowledge إلى مجلد Secrets Vault Backups في Google Drive، مع الاحتفاظ بآخر 10 نسخ تلقائياً."
                  : "Zero-knowledge encrypted backups are uploaded to your 'Secrets Vault Backups' Drive folder (keeping the 10 latest snapshots)."}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!driveStatus?.connected ? (
                  <button
                    type="button"
                    onClick={handleInitiateDriveOAuth}
                    disabled={driveConnecting || !driveStatus?.configured}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{lang === "ar" ? "تسجيل الدخول وربط Google Drive الآن" : "Sign in & Connect Google Drive"}</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleDriveBackupNow}
                      disabled={driveLoading}
                      className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${driveLoading ? "animate-spin" : ""}`} />
                      <span>{lang === "ar" ? "رفع نسخة احتياطية إلى Drive الآن" : "Backup to Drive Now"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectDrive}
                      disabled={driveLoading}
                      className="px-3 py-2 rounded-xl border border-rose-500/20 hover:bg-rose-500/10 text-rose-400 text-xs font-medium transition-colors"
                    >
                      {lang === "ar" ? "قطع الاتصال" : "Disconnect"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Snapshots List */}
            {driveStatus?.snapshots && driveStatus.snapshots.length > 0 && (
              <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-2">
                <h4 className="text-xs font-semibold text-text-primary flex items-center justify-between">
                  <span>{lang === "ar" ? "النسخ الاحتياطية المتوفرة على السحابة / محلياً:" : "Available Snapshots:"}</span>
                  <span className="text-[10px] font-mono text-text-muted">{driveStatus.snapshots.length} / 10</span>
                </h4>
                <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
                  {driveStatus.snapshots.map((s) => (
                    <div key={s.id} className="py-2 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="font-mono text-text-primary flex items-center gap-1.5">
                          {s.is_cloud ? <Cloud className="w-3.5 h-3.5 text-cyan-400" /> : <Clock className="w-3.5 h-3.5 text-text-muted" />}
                          <span>{s.filename}</span>
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {s.created_at ? new Date(s.created_at).toLocaleString() : ""} • {(s.size_bytes / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Antigravity CLI (Local 100% Zero-Key) */}
        {activeTab === "agy" && (
          <div className="space-y-4">
            {/* Status Card */}
            <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-semibold text-text-primary">
                    {lang === "ar" ? "حالة Antigravity CLI (المحرك المحلي)" : "Antigravity CLI Engine Status"}
                  </h4>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  agyStatus?.available
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                }`}>
                  {agyStatus?.available ? (lang === "ar" ? "🟢 مثبت وجاهز" : "🟢 Installed & Ready") : (lang === "ar" ? "🔴 غير مثبت" : "🔴 Not Installed")}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-canvas-900 border border-border font-mono text-[11px] text-text-secondary break-all">
                <span className="text-text-muted select-none mr-2 block text-[10px] uppercase tracking-wider mb-0.5">Executable Path:</span>
                {agyStatus?.path || "agy (PATH)"}
              </div>

              <p className="text-xs text-text-muted leading-relaxed">
                {lang === "ar"
                  ? "يعمل Antigravity CLI مباشرة على جهازك بسرعة فائقة. لا يتطلب أي مفتاح API خارجي ولا يستهلك أي رصيد، مع الحفاظ على سرية بياناتك بنسبة 100% محلياً."
                  : "Antigravity CLI runs 100% locally on your machine with near-zero latency, zero API keys required, and zero cloud token usage."}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestAgy}
                  disabled={agyLoading || !agyStatus?.available}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${agyLoading ? "animate-pulse" : ""}`} />
                  <span>{agyLoading ? (lang === "ar" ? "جاري القياس..." : "Testing...") : (lang === "ar" ? "اختبار سرعة الاستجابة (Ping)" : "Test Latency (Ping)")}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSetDefaultAgy}
                  disabled={activeProviderId === "builtin_agy_cli" || !agyStatus?.available}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    activeProviderId === "builtin_agy_cli"
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                      : "bg-canvas-850 hover:bg-canvas-800 border border-border text-text-primary"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {activeProviderId === "builtin_agy_cli"
                      ? (lang === "ar" ? "هو المزود الافتراضي حالياً ✓" : "Active Default Provider ✓")
                      : (lang === "ar" ? "تعيين كمزود افتراضي للاستيراد" : "Set as Default Provider")}
                  </span>
                </button>
              </div>

              {/* Latency Test Result */}
              {agyTestResult && (
                <div className={`p-3 rounded-lg text-xs border ${
                  agyTestResult.success
                    ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                }`}>
                  {agyTestResult.success ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{lang === "ar" ? `استجابة فائقة السرعة: تم بنجاح في ${agyTestResult.elapsed_ms}ms` : `Ping successful: ${agyTestResult.elapsed_ms}ms`}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{agyTestResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Commands Guide */}
            <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-2.5">
              <h4 className="text-xs font-semibold text-text-primary">
                {lang === "ar" ? "أوامر سريعة للأداة (Terminal Cheat-Sheet):" : "Quick CLI Commands:"}
              </h4>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between p-2 rounded bg-canvas-900 border border-border/50">
                  <span className="text-cyan-400">agy models</span>
                  <span className="text-text-muted text-[10px]">{lang === "ar" ? "عرض النماذج المتاحة محلياً" : "List available models"}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-canvas-900 border border-border/50">
                  <span className="text-cyan-400">agy update</span>
                  <span className="text-text-muted text-[10px]">{lang === "ar" ? "تحديث الأداة لأحدث إصدار" : "Update CLI to latest"}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-canvas-900 border border-border/50">
                  <span className="text-cyan-400">agy changelog</span>
                  <span className="text-text-muted text-[10px]">{lang === "ar" ? "عرض سجل التغييرات" : "View changelog"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: LLM / AI Assistant Settings */}
        {activeTab === "llm" && (
          <div className="space-y-4">
            {/* Zero-Knowledge Redaction Assurance */}
            <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-cyan-300 text-xs flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">
                  {lang === "ar" ? "إدارة النماذج المشفرة في الخزنة (AI Models Project):" : "Encrypted AI Models in Vault:"}
                </span>
                <p className="text-[11px] text-cyan-200/80 leading-relaxed">
                  {lang === "ar"
                    ? "يتم حفظ كل مزود كعنصر مشفر بـ AES-256-GCM في مشروع AI Models مع تشفير كامل لمفاتيح الـ API. يمكنك إضافة عدة مزودات (مثل OpenAI، Groq، أو Ollama المحلي) والتبديل بينها مباشرة أثناء الاستيراد الذكي."
                    : "Every provider is stored as an encrypted item in the 'AI Models' project. Add multiple providers (OpenAI, Groq, local Ollama) and switch between them seamlessly during Smart Import."}
                </p>
              </div>
            </div>

            {/* Providers Header & Add Button */}
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span>{lang === "ar" ? "مزودات الذكاء الاصطناعي المسجلة:" : "Configured AI Providers:"}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-canvas-900 border border-border text-text-muted">
                  {providers.length}
                </span>
              </h4>

              {!isAddingProvider && (
                <button
                  type="button"
                  onClick={openAddProvider}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm shadow-cyan-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === "ar" ? "إضافة مزود جديد" : "Add AI Provider"}</span>
                </button>
              )}
            </div>

            {/* Add / Edit Provider Form */}
            {isAddingProvider && (
              <form onSubmit={handleSaveProvider} className="p-4 rounded-xl bg-canvas-950 border border-cyan-500/30 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <h5 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>
                      {providerForm.id
                        ? (lang === "ar" ? "تعديل مزود الذكاء الاصطناعي" : "Edit AI Provider")
                        : (lang === "ar" ? "إضافة مزود ذكاء اصطناعي جديد" : "Add New AI Provider")}
                    </span>
                  </h5>
                  <button
                    type="button"
                    onClick={() => setIsAddingProvider(false)}
                    className="text-xs text-text-muted hover:text-text-primary"
                  >
                    {lang === "ar" ? "إلغاء" : "Cancel"}
                  </button>
                </div>

                {/* 1-Click Presets */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-text-secondary block">
                    {lang === "ar" ? "قوالب سريعة بنقرة واحدة (Presets):" : "Quick Presets:"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((pst) => {
                      const Icon = pst.icon;
                      return (
                        <button
                          key={pst.id}
                          type="button"
                          onClick={() => applyPreset(pst)}
                          className="px-2.5 py-1 rounded-lg bg-canvas-900 hover:bg-canvas-850 border border-border text-[11px] font-medium text-text-secondary hover:text-text-primary flex items-center gap-1.5 transition-colors"
                        >
                          <Icon className="w-3 h-3 text-cyan-400" />
                          <span>{pst.label}</span>
                          {pst.vision && (
                            <span className="text-[9px] text-cyan-400 bg-cyan-950 px-1 rounded border border-cyan-500/20">
                              👁️ Vision
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary">
                      {lang === "ar" ? "اسم المزود (Display Title)" : "Provider Name"}
                    </label>
                    <input
                      type="text"
                      required
                      value={providerForm.title}
                      onChange={(e) => setProviderForm({ ...providerForm, title: e.target.value })}
                      placeholder="OpenAI GPT-4o, Groq LLaMA, Ollama..."
                      className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-text-secondary">
                      {lang === "ar" ? "نوع المزود (Backend Type)" : "Backend Type"}
                    </label>
                    <select
                      value={providerForm.backend_type}
                      onChange={(e) => setProviderForm({ ...providerForm, backend_type: e.target.value })}
                      className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-cyan-500"
                    >
                      <option value="openai_compat">OpenAI Compatible (HTTP API / Ollama / Groq)</option>
                      <option value="agy_cli">Google Antigravity CLI (Local Subprocess)</option>
                    </select>
                  </div>
                </div>

                {providerForm.backend_type === "openai_compat" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-text-secondary">
                          {lang === "ar" ? "رابط واجهة API (Base URL)" : "API Base URL"}
                        </label>
                        <input
                          type="text"
                          required
                          value={providerForm.base_url}
                          onChange={(e) => setProviderForm({ ...providerForm, base_url: e.target.value })}
                          placeholder="https://api.openai.com/v1 أو http://localhost:11434/v1"
                          className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary font-mono focus:outline-none focus:border-cyan-500"
                          dir="ltr"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-text-secondary">
                          {lang === "ar" ? "اسم النموذج (Model Name)" : "Model Name"}
                        </label>
                        <input
                          type="text"
                          required
                          value={providerForm.model}
                          onChange={(e) => setProviderForm({ ...providerForm, model: e.target.value })}
                          placeholder="gpt-4o, llama-3.3-70b-versatile, llava..."
                          className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary font-mono focus:outline-none focus:border-cyan-500"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-text-secondary">
                          {lang === "ar" ? "مفتاح API السري" : "API Secret Key"}
                        </span>
                        {providerForm.id && (
                          <span className="text-text-muted text-[10px]">
                            {lang === "ar" ? "اتركه فارغاً للاحتفاظ بالمفتاح الحالي المشفر" : "Leave blank to keep existing key"}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showLlmKey ? "text" : "password"}
                          value={providerForm.api_key}
                          onChange={(e) => setProviderForm({ ...providerForm, api_key: e.target.value })}
                          placeholder={providerForm.id ? "•••••••••••••••• (Leave blank to keep current)" : "sk-..."}
                          className="w-full h-9 px-3 pe-10 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary font-mono focus:outline-none focus:border-cyan-500"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLlmKey(!showLlmKey)}
                          className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                        >
                          {showLlmKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Toggles */}
                <div className="space-y-2 pt-2 border-t border-border">
                  {/* Vision Support Toggle */}
                  <label className="flex items-start gap-2.5 p-2 rounded-xl bg-canvas-900/60 border border-border cursor-pointer hover:bg-canvas-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={providerForm.supports_vision}
                      onChange={(e) => setProviderForm({ ...providerForm, supports_vision: e.target.checked })}
                      className="mt-0.5 rounded border-border bg-canvas-900 text-cyan-500 focus:ring-0"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                        <span>👁️</span>
                        <span>{lang === "ar" ? "دعم قراءة وتحليل الصور (Supports Vision / Multimodal)" : "Supports Vision / Multimodal Images"}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                          Recommended for GPT-4o / LLaVA
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted leading-relaxed">
                        {lang === "ar"
                          ? "يسمح برفع الصور ولقطات الشاشة ولصقها بـ Ctrl+V في نافذة الاستيراد الذكي لاستخراج الحقول والبيانات منها مباشرة."
                          : "Enables drag & drop, file upload, and clipboard paste (Ctrl+V) in Smart Import for credential extraction."}
                      </p>
                    </div>
                  </label>

                  {/* Raw Mode Toggle */}
                  <label className="flex items-start gap-2.5 p-2 rounded-xl bg-canvas-900/60 border border-border cursor-pointer hover:bg-canvas-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={providerForm.raw_mode}
                      onChange={(e) => setProviderForm({ ...providerForm, raw_mode: e.target.checked })}
                      className="mt-0.5 rounded border-border bg-canvas-900 text-amber-500 focus:ring-0"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-text-primary block">
                        {lang === "ar" ? "الوضع المباشر بدون حجب الأسرار (Raw Mode)" : "Direct Mode Without Local Redaction (Raw Mode)"}
                      </span>
                      <p className="text-[11px] text-text-muted leading-relaxed">
                        {lang === "ar"
                          ? "يُنصح به فقط مع النماذج المحلية تماماً (مثل Ollama). مع النماذج السحابية، يفضل إبقاؤه معطلاً لتفعيل حماية Zero-Knowledge."
                          : "Recommended only for 100% local models like Ollama. Keep disabled for cloud providers to retain Zero-Knowledge redaction."}
                      </p>
                    </div>
                  </label>

                  {/* Set Active Checkbox */}
                  <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={providerForm.set_as_active}
                      onChange={(e) => setProviderForm({ ...providerForm, set_as_active: e.target.checked })}
                      className="rounded border-border bg-canvas-900 text-cyan-500 focus:ring-0"
                    />
                    <span>{lang === "ar" ? "تعيين هذا المزود كمزود افتراضي نشط (Default Active Provider)" : "Set as default active provider"}</span>
                  </label>
                </div>

                {/* Test Result Message */}
                {testResult && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                      testResult.success
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    }`}
                  >
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                    <span>{testResult.message || testResult.error}</span>
                  </div>
                )}

                {/* Form Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleTestFormConfig}
                    disabled={testFormLoading}
                    className="px-3 py-1.5 rounded-xl bg-canvas-900 hover:bg-canvas-850 border border-border text-xs font-medium text-text-secondary hover:text-text-primary flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testFormLoading ? "animate-spin text-cyan-400" : ""}`} />
                    <span>{lang === "ar" ? "اختبار هذا الإعداد" : "Test Provider"}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingProvider(false)}
                      className="px-3 py-1.5 rounded-xl bg-canvas-900 hover:bg-canvas-850 border border-border text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
                    >
                      {lang === "ar" ? "إلغاء" : "Cancel"}
                    </button>
                    <button
                      type="submit"
                      disabled={llmLoading}
                      className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors shadow-sm shadow-cyan-600/20 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{lang === "ar" ? "حفظ المزود في الخزنة" : "Save Provider"}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Providers Cards List */}
            <div className="space-y-2.5">
              {providers.map((p) => {
                const isActive = p.id === activeProviderId || p.is_active;
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isActive
                        ? "bg-canvas-900/90 border-cyan-500/50 ring-1 ring-cyan-500/30"
                        : "bg-canvas-950/60 border-border hover:bg-canvas-900/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Active Selector & Info */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleSetActiveProvider(p.id)}
                          className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                            isActive
                              ? "border-cyan-500 bg-cyan-500 text-white"
                              : "border-border hover:border-cyan-400 bg-canvas-900"
                          }`}
                          title={lang === "ar" ? "تعيين كمزود نشط" : "Set as active"}
                        >
                          {isActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </button>

                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-text-primary truncate">
                              {p.title}
                            </span>
                            {isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
                                {lang === "ar" ? "النشط حالياً" : "Active"}
                              </span>
                            )}
                            {p.supports_vision ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-0.5">
                                <span>👁️</span>
                                <span>Vision</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-canvas-900 border border-border text-text-muted">
                                Text Only
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-text-muted font-mono flex-wrap">
                            <span>{p.model}</span>
                            <span>•</span>
                            <span className="truncate max-w-[200px]" dir="ltr">{p.base_url}</span>
                            <span>•</span>
                            <span className={p.has_api_key ? "text-emerald-400/90" : "text-text-muted"}>
                              {p.has_api_key
                                ? (lang === "ar" ? "🔑 مفتاح مشفر" : "🔑 Key Encrypted")
                                : (lang === "ar" ? "بدون مفتاح" : "No Key")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTestProvider(p)}
                          disabled={testLoadingId === p.id}
                          className="p-1.5 rounded-lg bg-canvas-900 hover:bg-canvas-850 border border-border text-text-muted hover:text-cyan-400 transition-colors"
                          title={lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testLoadingId === p.id ? "animate-spin text-cyan-400" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditProvider(p)}
                          className="p-1.5 rounded-lg bg-canvas-900 hover:bg-canvas-850 border border-border text-text-muted hover:text-text-primary transition-colors"
                          title={lang === "ar" ? "تعديل" : "Edit"}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProvider(p.id, p.title)}
                          className="p-1.5 rounded-lg bg-canvas-900 hover:bg-rose-950/40 border border-border hover:border-rose-500/30 text-text-muted hover:text-rose-400 transition-colors"
                          title={lang === "ar" ? "حذف من الخزنة" : "Delete"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {providers.length === 0 && !isAddingProvider && (
                <div className="p-8 text-center rounded-xl bg-canvas-950 border border-dashed border-border space-y-3">
                  <Bot className="w-8 h-8 text-text-muted mx-auto" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-text-primary">
                      {lang === "ar" ? "لا توجد مزودات ذكاء اصطناعي مضافة بعد" : "No AI Providers Configured"}
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {lang === "ar"
                        ? "أضف مزودك الأول في مشروع AI Models لبدء استخدام الاستيراد الذكي وتحليل الصور."
                        : "Add your first provider to the 'AI Models' project to use Smart Import and vision analysis."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openAddProvider}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
                  >
                    {lang === "ar" ? "إضافة مزود الآن" : "Add Provider Now"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Templates Manager */}
        {activeTab === "templates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <LayoutGrid className="w-4 h-4 text-brand-400" />
                  <span>{lang === "ar" ? "قوالب العناصر المحفوظة:" : "Item Templates:"}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-canvas-900 border border-border text-text-muted">
                    {(templates || []).length}
                  </span>
                </h4>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {lang === "ar"
                    ? "تحدد القوالب الحقول الافتراضية والأنواع عند إضافة عناصر جديدة. يمكنك حفظ أي عنصر كقالب في أي وقت."
                    : "Templates define the fields and types when adding new items. Save any item as a template at any time."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {(templates || []).map((t) => {
                const p = t.payload || {};
                const fieldList = p.fields || [];
                return (
                  <div key={t.id} className="p-3 rounded-xl bg-canvas-950 border border-border hover:border-brand-500/30 transition-all space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-canvas-900 border border-border flex items-center justify-center text-brand-400 shrink-0">
                          {t.is_builtin ? <KeyRound className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-text-primary">{p.name || t.id}</div>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                            t.is_builtin
                              ? "bg-canvas-900 text-text-muted border border-border"
                              : "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                          }`}>
                            {t.is_builtin ? (lang === "ar" ? "قالب مدمج" : "Builtin") : (lang === "ar" ? "قالب مخصص" : "Custom")}
                          </span>
                        </div>
                      </div>

                      {!t.is_builtin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id, p.name)}
                          className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title={lang === "ar" ? "حذف القالب" : "Delete template"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {p.description && (
                      <p className="text-[11px] text-text-muted line-clamp-1">{p.description}</p>
                    )}

                    <div className="flex flex-wrap gap-1 pt-1">
                      {fieldList.map((f, idx) => (
                        <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-canvas-900 border border-border text-text-secondary">
                          {f.label || f.id}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 4: Master Password & Lock */}
        {activeTab === "security" && (
          <div className="space-y-4">
            {/* Auto Lock Section */}
            <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-400" />
                <h4 className="text-xs font-semibold text-text-primary">
                  {lang === "ar" ? "القفل التلقائي عند الخمول" : "Auto-Lock Timer"}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                  className="h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                >
                  <option value={1}>{lang === "ar" ? "دقيقة واحدة" : "1 minute"}</option>
                  <option value={5}>{lang === "ar" ? "5 دقائق (موصى به)" : "5 minutes (Recommended)"}</option>
                  <option value={15}>{lang === "ar" ? "15 دقيقة" : "15 minutes"}</option>
                  <option value={30}>{lang === "ar" ? "30 دقيقة" : "30 minutes"}</option>
                  <option value={0}>{lang === "ar" ? "تعطيل القفل التلقائي" : "Disabled"}</option>
                </select>
              </div>
            </div>

            {/* Change Master Password */}
            <form onSubmit={handleChangePassword} className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-brand-400" />
                <h4 className="text-xs font-semibold text-text-primary">
                  {lang === "ar" ? "تغيير كلمة المرور الرئيسية" : "Change Master Password"}
                </h4>
              </div>

              <div className="space-y-2 pt-1">
                <input
                  type={showPass ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder={lang === "ar" ? "كلمة المرور الرئيسية الحالية..." : "Current master password..."}
                  className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                />

                <input
                  type={showPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={lang === "ar" ? "كلمة المرور الجديدة..." : "New master password..."}
                  className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                />

                <input
                  type={showPass ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder={lang === "ar" ? "تأكيد كلمة المرور الجديدة..." : "Confirm new master password..."}
                  className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                />

                <input
                  type="text"
                  value={newHint}
                  onChange={(e) => setNewHint(e.target.value)}
                  placeholder={lang === "ar" ? "تلميح اختياري لكلمة المرور (لا تضع كلمة السر هنا)..." : "Optional password hint..."}
                  className="w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
                >
                  {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPass ? (lang === "ar" ? "إخفاء" : "Hide") : (lang === "ar" ? "إظهار" : "Show")}</span>
                </button>

                <button
                  type="submit"
                  disabled={!oldPassword || !newPassword || newPassword !== confirmNewPassword || passLoading}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {lang === "ar" ? "تحديث كلمة المرور" : "Update Master Password"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer Close */}
        <div className="flex items-center justify-end pt-2 border-t border-border">
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
