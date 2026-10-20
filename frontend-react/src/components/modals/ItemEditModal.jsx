import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import {
  KeyRound,
  Code2,
  Database,
  Server,
  FileText,
  CreditCard,
  Sliders,
  Sparkles,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Tag,
  Clock,
  Globe,
} from "lucide-react";

const ITEM_TYPES = [
  { id: "login", labelAr: "تسجيل دخول", labelEn: "Login", icon: KeyRound },
  { id: "api_key", labelAr: "مفتاح برمجي", labelEn: "API Key", icon: Code2 },
  { id: "database", labelAr: "قاعدة بيانات", labelEn: "Database", icon: Database },
  { id: "server", labelAr: "خادم / SSH", labelEn: "Server", icon: Server },
  { id: "note", labelAr: "ملاحظة سرية", labelEn: "Secure Note", icon: FileText },
  { id: "card", labelAr: "بطاقة بنكية", labelEn: "Card", icon: CreditCard },
  { id: "custom", labelAr: "مخصص", labelEn: "Custom", icon: Sliders },
];

export function ItemEditModal({ item, onClose }) {
  const { lang, projects, categories, templates, loadVaultData, selectItem, showToast } = useVault();
  const isEditing = Boolean(item);
  const isAr = lang === "ar";

  // Template saving state
  const [showSaveTplPrompt, setShowSaveTplPrompt] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [savingTpl, setSavingTpl] = useState(false);

  // Custom user templates (non-builtins)
  const customTemplates = (templates || []).filter((t) => !t.is_builtin);

  // Item Type
  const [selectedType, setSelectedType] = useState(() => {
    if (!item) return "login";
    const title = (item.payload?.title || "").toLowerCase();
    const fields = item.payload?.fields || [];
    if (fields.some((f) => f.type === "ssh_key") || title.includes("ssh") || title.includes("server")) return "server";
    if (fields.some((f) => f.label?.toLowerCase().includes("database") || f.label?.toLowerCase().includes("host"))) return "database";
    if (fields.some((f) => f.type === "card_number")) return "card";
    if (fields.every((f) => f.type === "multiline")) return "note";
    if (title.includes("api") || title.includes("key") || title.includes("token")) return "api_key";
    return "login";
  });

  // Basic Attributes
  const [title, setTitle] = useState(item?.payload?.title || "");
  const [websiteUrl, setWebsiteUrl] = useState(item?.payload?.website_url || "");
  const [projectId, setProjectId] = useState(item?.project_id || "");
  const [categoryId, setCategoryId] = useState(item?.category_id || "");
  const [tagsStr, setTagsStr] = useState((item?.payload?.tags || []).join(", "));
  const [rotationDays, setRotationDays] = useState(item?.payload?.rotation_days || "");
  const [description, setDescription] = useState(item?.payload?.description || "");

  // Expandable Advanced Options
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(item?.project_id || item?.category_id || item?.payload?.rotation_days || item?.payload?.tags?.length)
  );

  // Field Initializer
  function getPresetFields(type) {
    switch (type) {
      case "login":
        return [
          { id: "f_user", label: isAr ? "اسم المستخدم / البريد" : "Username / Email", type: "text", is_secret: false, value: "" },
          { id: "f_pass", label: isAr ? "كلمة المرور" : "Password", type: "password", is_secret: true, value: "" },
          { id: "f_totp", label: isAr ? "مفتاح 2FA / TOTP (اختياري)" : "2FA / TOTP Secret (Optional)", type: "totp", is_secret: true, value: "" },
        ];
      case "api_key":
        return [
          { id: "f_key", label: isAr ? "قيمة المفتاح السري" : "API Secret Key", type: "password", is_secret: true, value: "" },
          { id: "f_env", label: isAr ? "البيئة / النطاق" : "Environment", type: "text", is_secret: false, value: "production" },
        ];
      case "database":
        return [
          { id: "f_host", label: isAr ? "المضيف (Host)" : "Host", type: "text", is_secret: false, value: "localhost" },
          { id: "f_port", label: isAr ? "المنفذ (Port)" : "Port", type: "text", is_secret: false, value: "5432" },
          { id: "f_dbname", label: isAr ? "اسم قاعدة البيانات" : "Database Name", type: "text", is_secret: false, value: "" },
          { id: "f_user", label: isAr ? "المستخدم" : "Username", type: "text", is_secret: false, value: "postgres" },
          { id: "f_pass", label: isAr ? "كلمة المرور" : "Password", type: "password", is_secret: true, value: "" },
        ];
      case "server":
        return [
          { id: "f_host", label: isAr ? "عنوان السيرفر (IP / Host)" : "Server IP / Host", type: "text", is_secret: false, value: "" },
          { id: "f_user", label: isAr ? "المستخدم (User)" : "Username", type: "text", is_secret: false, value: "root" },
          { id: "f_key", label: isAr ? "مفتاح SSH أو كلمة السر" : "SSH Key / Password", type: "ssh_key", is_secret: true, value: "" },
        ];
      case "card":
        return [
          { id: "f_holder", label: isAr ? "اسم حامل البطاقة" : "Cardholder Name", type: "text", is_secret: false, value: "" },
          { id: "f_num", label: isAr ? "رقم البطاقة" : "Card Number", type: "card_number", is_secret: true, value: "" },
          { id: "f_exp", label: isAr ? "تاريخ الانتهاء (MM/YY)" : "Expiration (MM/YY)", type: "text", is_secret: false, value: "" },
          { id: "f_cvv", label: isAr ? "رمز الأمان (CVV)" : "Security Code (CVV)", type: "pin", is_secret: true, value: "" },
        ];
      case "note":
        return [
          { id: "f_note", label: isAr ? "الملاحظة المشفرة" : "Encrypted Content", type: "multiline", is_secret: true, value: "" },
        ];
      case "custom":
      default:
        return [
          { id: "f_1", label: isAr ? "اسم الحقل" : "Field Name", type: "text", is_secret: false, value: "" },
          { id: "f_2", label: isAr ? "القيمة السرية" : "Secret Value", type: "password", is_secret: true, value: "" },
        ];
    }
  }

  const [fields, setFields] = useState(() => {
    if (item?.payload?.fields && item.payload.fields.length > 0) {
      return item.payload.fields.map((f) => ({
        id: f.id || `f_${Math.random().toString(36).substring(2, 9)}`,
        label: f.label || "",
        type: f.type || "text",
        is_secret: Boolean(f.is_secret),
        value: f.value ?? "",
        values: f.values || {},
        history: f.history || [],
      }));
    }
    return getPresetFields("login");
  });

  const [showPassMap, setShowPassMap] = useState({});
  const [loading, setLoading] = useState(false);

  function handleSelectType(typeId) {
    setSelectedType(typeId);
    if (!isEditing) {
      setFields(getPresetFields(typeId));
    }
  }

  function handleSelectCustomTemplate(tpl) {
    setSelectedType(tpl.id);
    if (!isEditing) {
      const tplFields = (tpl.payload?.fields || []).map((f) => ({
        id: `f_${Math.random().toString(36).substring(2, 9)}`,
        label: f.label || "Field",
        type: f.type || "text",
        is_secret: Boolean(f.is_secret),
        value: "",
        values: {},
        history: [],
      }));
      setFields(tplFields.length > 0 ? tplFields : getPresetFields("custom"));
      if (!title.trim() && tpl.payload?.name) {
        setTitle(tpl.payload.name);
      }
    }
  }

  async function handleSaveTemplate(e) {
    e?.preventDefault();
    if (!tplName.trim()) {
      showToast(isAr ? "يرجى كتابة اسم القالب" : "Please enter a template name", "warning");
      return;
    }
    setSavingTpl(true);
    try {
      const validFields = fields
        .filter((f) => (f.label || "").trim().length > 0)
        .map((f) => ({
          label: f.label.trim(),
          type: f.type || "text",
          is_secret: Boolean(f.is_secret),
        }));

      if (validFields.length === 0) {
        showToast(isAr ? "يجب أن يحتوي القالب على حقل واحد على الأقل" : "Template must have at least one field", "warning");
        return;
      }

      await api("/templates", {
        method: "POST",
        body: {
          name: tplName.trim(),
          icon: "folder",
          description: tplDesc.trim() || undefined,
          fields: validFields,
        },
      });

      showToast(isAr ? "تم حفظ القالب بنجاح!" : "Template saved successfully!", "success");
      await loadVaultData();
      setShowSaveTplPrompt(false);
      setTplName("");
      setTplDesc("");
    } catch (err) {
      showToast(err.message || (isAr ? "فشل حفظ القالب" : "Failed to save template"), "error");
    } finally {
      setSavingTpl(false);
    }
  }

  function updateField(idx, key, val) {
    setFields((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      return next;
    });
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        id: `f_${Date.now()}`,
        label: isAr ? "حقل إضافي" : "Additional Field",
        type: "text",
        is_secret: false,
        value: "",
        values: {},
        history: [],
      },
    ]);
  }

  function removeField(idx) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleShowPass(idx) {
    setShowPassMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  async function handleQuickGenerate(idx) {
    try {
      const res = await api("/generator/password", {
        method: "POST",
        body: { length: 24, symbols: true, digits: true, avoid_ambiguous: true },
      });
      if (res?.password) {
        updateField(idx, "value", res.password);
        setShowPassMap((prev) => ({ ...prev, [idx]: true }));
        showToast(isAr ? "تم توليد كلمة سر عشوائية قوية" : "Generated secure password", "success");
      }
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || loading) return;

    setLoading(true);
    try {
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        schema: 2,
        title: title.trim(),
        website_url: websiteUrl.trim() || null,
        description: description.trim() || null,
        tags,
        template_id: null,
        rotation_days: rotationDays ? parseInt(rotationDays, 10) : null,
        fields: fields
          .filter((f) => f.label.trim().length > 0 || (f.value && String(f.value).trim().length > 0))
          .map((f) => ({
            id: f.id,
            label: f.label.trim() || "Field",
            type: f.type,
            is_secret: Boolean(f.is_secret),
            value: f.value,
            values: f.values || {},
            history: f.history || [],
          })),
      };

      if (isEditing) {
        await api(`/items/${item.id}`, {
          method: "PUT",
          body: {
            project_id: projectId || null,
            category_id: categoryId || null,
            payload,
          },
        });
        showToast(isAr ? "تم حفظ التعديلات بنجاح" : "Item updated successfully", "success");
        await loadVaultData();
        await selectItem(item.id);
      } else {
        const created = await api("/items", {
          method: "POST",
          body: {
            project_id: projectId || null,
            category_id: categoryId || null,
            payload,
          },
        });
        showToast(isAr ? "تم إنشاء العنصر بنجاح" : "Item created successfully", "success");
        await loadVaultData();
        if (created?.id) await selectItem(created.id);
      }

      onClose();
    } catch (err) {
      showToast(err.message || (isAr ? "تعذر حفظ العنصر" : "Failed to save item"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEditing ? (isAr ? "تعديل العنصر" : "Edit Item") : (isAr ? "إضافة عنصر جديد" : "New Item")}
      subtitle={isAr ? "حفظ وتشفير البيانات محلياً بنموذج Zero-Knowledge" : "Zero-knowledge local encryption via AES-256-GCM"}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type Selector Pills */}
        {!isEditing && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
              {isAr ? "نوع الحساب أو السر" : "Item Category"}
            </label>
            <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-canvas-950 border border-border">
              {ITEM_TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = selectedType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectType(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-brand-600 text-white shadow-sm"
                        : "text-text-secondary hover:text-text-primary hover:bg-canvas-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                    <span>{isAr ? t.labelAr : t.labelEn}</span>
                  </button>
                );
              })}

              {/* User Custom Templates */}
              {customTemplates.map((tpl) => {
                const isSelected = selectedType === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectCustomTemplate(tpl)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "text-cyan-300/80 hover:text-cyan-200 hover:bg-cyan-950/40 border border-cyan-500/20"
                    }`}
                    title={tpl.payload?.description || tpl.payload?.name}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" strokeWidth={1.8} />
                    <span>{tpl.payload?.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Essential Form Inputs */}
        <div className="space-y-3.5 p-4 rounded-xl bg-canvas-950 border border-border">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-primary block">
              {isAr ? "العنوان *" : "Title *"}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                selectedType === "login"
                  ? (isAr ? "مثال: GitHub, Google, Slack..." : "e.g. GitHub, Google, Slack...")
                  : selectedType === "api_key"
                  ? (isAr ? "مثال: OpenAI Production Key..." : "e.g. OpenAI Production Key...")
                  : selectedType === "database"
                  ? (isAr ? "مثال: Main Production DB..." : "e.g. Main Production DB...")
                  : (isAr ? "عنوان العنصر..." : "Item title...")
              }
              autoFocus
              required
              autoComplete="off"
              data-lpignore="true"
              className="w-full h-10 px-3.5 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500 font-medium"
            />
          </div>

          {/* Website URL (for Login) */}
          {selectedType === "login" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.8} />
                <span>{isAr ? "رابط تسجيل الدخول (URL)" : "Login URL (Optional)"}</span>
              </label>
              <input
                type="text"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
                autoComplete="off"
                data-lpignore="true"
                className="w-full h-9 px-3.5 text-xs font-mono bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                dir="ltr"
              />
            </div>
          )}

          {/* Fields List */}
          <div className="space-y-3 pt-1">
            {fields.map((f, idx) => {
              const isPasswordLike = f.type === "password" || f.is_secret;
              const isMultiline = f.type === "multiline" || f.type === "ssh_key";
              const isMonospace = isPasswordLike || f.type === "totp" || f.type === "api_key" || f.type === "ssh_key" || f.type === "database_url" || f.type === "card_number" || f.type === "pin";
              const isShown = Boolean(showPassMap[idx]);

              return (
                <div key={f.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-text-secondary text-xs">
                      {f.label}
                    </span>

                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        className="text-text-muted hover:text-rose-400 p-0.5 transition-colors flex items-center gap-1 text-[11px]"
                        title={isAr ? "حذف الحقل" : "Remove"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[10px]">{isAr ? "حذف" : "Remove"}</span>
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    {isMultiline ? (
                      <textarea
                        rows={3}
                        value={f.value}
                        onChange={(e) => updateField(idx, "value", e.target.value)}
                        placeholder={isAr ? "أدخل المحتوى المشفر..." : "Enter encrypted content..."}
                        autoComplete="off"
                        data-lpignore="true"
                        className="w-full p-2.5 text-xs font-mono bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500 resize-none leading-relaxed"
                        dir="ltr"
                      />
                    ) : (
                      <>
                        <input
                          type={isPasswordLike && !isShown ? "password" : "text"}
                          value={f.value}
                          onChange={(e) => updateField(idx, "value", e.target.value)}
                          placeholder={
                            f.type === "totp"
                              ? "JBSWY3DPEHPK3PXP"
                              : isPasswordLike
                              ? "••••••••••••••••"
                              : isAr
                              ? "أدخل القيمة..."
                              : "Enter value..."
                          }
                          autoComplete={isPasswordLike ? "new-password" : "off"}
                          data-lpignore="true"
                          className={`w-full h-9 px-3 text-xs bg-canvas-900 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500 ${
                            isMonospace ? "font-mono" : ""
                          } ${isPasswordLike ? "pr-20" : ""}`}
                          dir={isMonospace || f.type === "url" || f.type === "email" ? "ltr" : undefined}
                        />

                        {isPasswordLike && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-canvas-900 pl-1">
                            <button
                              type="button"
                              onClick={() => toggleShowPass(idx)}
                              className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                              title={isShown ? "Hide" : "Show"}
                              tabIndex={-1}
                            >
                              {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickGenerate(idx)}
                              className="p-1 rounded text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-colors"
                              title={isAr ? "توليد كلمة سر عشوائية" : "Generate Password"}
                              tabIndex={-1}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addField}
              className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium pt-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? "إضافة حقل آخر" : "Add Another Field"}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Advanced Section */}
        <div className="rounded-xl border border-border overflow-hidden bg-canvas-950/60">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-3 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-900 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.8} />
              <span>{isAr ? "خيارات المشروع والتنظيم (اختياري)" : "Project & Organization (Optional)"}</span>
            </div>
            {showAdvanced ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
          </button>

          {showAdvanced && (
            <div className="p-4 pt-1 border-t border-border space-y-3 bg-canvas-950 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary block">
                    {isAr ? "المشروع" : "Project"}
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-brand-500"
                  >
                    <option value="">{isAr ? "بدون مشروع" : "None"}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.payload?.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary block">
                    {isAr ? "التصنيف" : "Category"}
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-brand-500"
                  >
                    <option value="">{isAr ? "بدون تصنيف" : "None"}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.payload?.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                    <Tag className="w-3 h-3 text-text-muted" />
                    <span>{isAr ? "الوسوم (مفصولة بفاصلة)" : "Tags (comma separated)"}</span>
                  </label>
                  <input
                    type="text"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    placeholder="database, api, work"
                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-text-secondary flex items-center gap-1">
                    <Clock className="w-3 h-3 text-text-muted" />
                    <span>{isAr ? "التدوير الدوري (أيام)" : "Key Rotation (Days)"}</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={rotationDays}
                    onChange={(e) => setRotationDays(e.target.value)}
                    placeholder="90"
                    className="w-full h-8 px-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-text-secondary block">
                  {isAr ? "الملاحظات المشفرة" : "Encrypted Notes"}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isAr ? "ملاحظات إضافية مشفرة محلياً..." : "Additional encrypted notes..."}
                  className="w-full p-2.5 text-xs bg-canvas-900 border border-border rounded-lg text-text-primary focus:outline-none focus:border-brand-500 resize-none leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => {
              setTplName(title.trim() ? `${title.trim()} (قالب)` : (isAr ? "قالب مخصص جديد" : "New Custom Template"));
              setShowSaveTplPrompt(true);
            }}
            className="px-3 py-2 rounded-xl bg-canvas-900 hover:bg-canvas-850 border border-border text-text-secondary hover:text-cyan-400 text-xs font-medium transition-colors flex items-center gap-1.5"
            title={isAr ? "حفظ الحقول الحالية كقالب لإعادة استخدامه لاحقاً" : "Save current fields as a reusable template"}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isAr ? "حفظ كقالب" : "Save as Template"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-900 transition-colors"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 active:scale-[0.99] text-white font-medium text-xs transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isEditing ? (isAr ? "حفظ التعديلات" : "Save Changes") : (isAr ? "حفظ العنصر" : "Save Item")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Save as Template Prompt Modal Overlay */}
        {showSaveTplPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-canvas-900 border border-cyan-500/30 rounded-2xl max-w-sm w-full p-4 space-y-3.5 shadow-2xl">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-text-primary">
                  {isAr ? "حفظ كقالب مخصص" : "Save as Custom Template"}
                </h4>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                {isAr
                  ? "سيتم حفظ أسماء وأنواع الحقول فقط بدون كلمات المرور أو القيم السرية، لتتمكن من استخدامها بضغطة زر لاحقاً."
                  : "Field labels and types will be saved without secret values, ready for quick reuse."}
              </p>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    {isAr ? "اسم القالب:" : "Template Name:"}
                  </label>
                  <input
                    type="text"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="مثال: حساب بنكي مخصص"
                    className="w-full h-8 px-2.5 text-xs bg-canvas-950 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-text-secondary block mb-1">
                    {isAr ? "الوصف (اختياري):" : "Description (Optional):"}
                  </label>
                  <input
                    type="text"
                    value={tplDesc}
                    onChange={(e) => setTplDesc(e.target.value)}
                    placeholder="وصف مختصر للقالب"
                    className="w-full h-8 px-2.5 text-xs bg-canvas-950 border border-border rounded-lg text-text-primary focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowSaveTplPrompt(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-800"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!tplName.trim() || savingTpl}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingTpl ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>{isAr ? "حفظ القالب" : "Save Template"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
