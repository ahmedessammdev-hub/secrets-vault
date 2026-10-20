import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import { Plus } from "lucide-react";

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#6b7280", // Gray
];

export function AddCategoryModal({ onClose }) {
  const { lang, loadVaultData, showToast } = useVault();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || loading) return;

    setLoading(true);
    try {
      await api("/categories", {
        method: "POST",
        body: {
          name: name.trim(),
          color: color || null,
        },
      });
      showToast(lang === "ar" ? "تم إنشاء التصنيف بنجاح" : "Category created successfully", "success");
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر إنشاء التصنيف" : "Failed to create category"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "تصنيف جديد" : "New Category"}
      subtitle={lang === "ar" ? "تصنيف العناصر حسب النوع أو الاستخدام" : "Group items by category and color"}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {lang === "ar" ? "اسم التصنيف" : "Category Name"}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === "ar" ? "مثال: قواعد البيانات، سيرفرات، بريد..." : "e.g. Databases, Cloud, Personal..."}
            autoFocus
            required
            className="w-full h-10 px-3.5 text-sm bg-canvas-950 border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary block">
            {lang === "ar" ? "لون التصنيف" : "Category Color"}
          </label>
          <div className="flex items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${
                  color === c ? "scale-125 ring-2 ring-brand-500 ring-offset-2 ring-offset-canvas-900" : "hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-800 transition-colors"
          >
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs transition-all flex items-center gap-1.5 shadow-md shadow-brand-600/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                <span>{lang === "ar" ? "إنشاء التصنيف" : "Create Category"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
