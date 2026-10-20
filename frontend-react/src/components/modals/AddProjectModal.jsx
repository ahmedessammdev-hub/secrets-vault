import React, { useState } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import { FolderGit2, Plus } from "lucide-react";

export function AddProjectModal({ onClose }) {
  const { lang, loadVaultData, showToast } = useVault();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || loading) return;

    setLoading(true);
    try {
      await api("/projects", {
        method: "POST",
        body: {
          name: name.trim(),
          notes: notes.trim() || null,
          environments: ["dev", "staging", "production"],
        },
      });
      showToast(lang === "ar" ? "تم إنشاء المشروع بنجاح" : "Project created successfully", "success");
      await loadVaultData();
      onClose();
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر إنشاء المشروع" : "Failed to create project"), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "مشروع جديد" : "New Project"}
      subtitle={lang === "ar" ? "تنظيم المفاتيح والمتغيرات بحسب بيئات العمل" : "Group credentials and environment secrets"}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {lang === "ar" ? "اسم المشروع" : "Project Name"}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === "ar" ? "مثال: API Backend, Mobile App..." : "e.g. Backend API, Mobile Client..."}
            autoFocus
            required
            className="w-full h-10 px-3.5 text-sm bg-canvas-950 border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {lang === "ar" ? "الوصف أو الملاحظات (اختياري)" : "Description / Notes (Optional)"}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={lang === "ar" ? "ملاحظات حول البنية التحتية أو المستودع..." : "Repository or infrastructure notes..."}
            className="w-full p-3 text-sm bg-canvas-950 border border-border rounded-xl text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all resize-none"
          />
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
                <span>{lang === "ar" ? "إنشاء المشروع" : "Create Project"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
