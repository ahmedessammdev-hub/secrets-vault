import React, { useMemo } from "react";
import { useVault } from "../../context/VaultContext";
import { Plus, Star, Folder, Tag, FileText, Layers, Download } from "lucide-react";

export default function ItemsList() {
  const {
    t,
    lang,
    items,
    projects,
    categories,
    currentView,
    selectedItemId,
    selectItem,
    openModal,
  } = useVault();

  // Filter items
  const filteredItems = useMemo(() => {
    let result = [...items];
    const now = new Date();

    if (currentView === "all") {
      result = result.filter((i) => !i.deleted_at && !i.is_archived);
    } else if (currentView === "favorites") {
      result = result.filter((i) => !i.deleted_at && i.is_favorite);
    } else if (currentView === "archive") {
      result = result.filter((i) => !i.deleted_at && i.is_archived);
    } else if (currentView === "trash") {
      result = result.filter((i) => i.deleted_at);
    } else if (currentView === "smart_expiring_30d") {
      const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      result = result.filter(
        (i) => i.expires_at && new Date(i.expires_at) >= now && new Date(i.expires_at) <= in30d
      );
    } else if (currentView === "smart_expired") {
      result = result.filter((i) => i.expires_at && new Date(i.expires_at) < now);
    } else if (currentView === "smart_no_2fa") {
      result = result.filter((i) => {
        if (i.deleted_at || i.is_archived) return false;
        const fields = i.payload?.fields || [];
        const hasLogin = fields.some((f) => f.label?.toLowerCase().includes("user") || f.label?.toLowerCase().includes("pass"));
        const has2fa = fields.some((f) => f.type === "totp");
        return hasLogin && !has2fa;
      });
    } else if (currentView === "smart_reused_secrets") {
      const hashCounts = {};
      items.forEach((it) => {
        if (it.deleted_at || it.is_archived) return;
        (it.payload?.fields || []).forEach((f) => {
          if (f.secret_hash) {
            hashCounts[f.secret_hash] = (hashCounts[f.secret_hash] || 0) + 1;
          }
        });
      });
      result = result.filter((it) => {
        if (it.deleted_at || it.is_archived) return false;
        return (it.payload?.fields || []).some((f) => f.secret_hash && hashCounts[f.secret_hash] > 1);
      });
    } else if (currentView === "smart_not_used_90d") {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      result = result.filter(
        (i) => !i.deleted_at && !i.is_archived && new Date(i.updated_at) < ninetyDaysAgo
      );
    } else if (currentView === "smart_no_project") {
      result = result.filter((i) => !i.deleted_at && !i.is_archived && !i.project_id);
    } else if (currentView.startsWith("project_")) {
      const pId = currentView.replace("project_", "");
      result = result.filter((i) => i.project_id === pId && !i.deleted_at);
    } else if (currentView.startsWith("cat_")) {
      const cId = currentView.replace("cat_", "");
      result = result.filter((i) => i.category_id === cId && !i.deleted_at);
    }

    return result;
  }, [items, currentView]);

  // Current view title
  const viewTitle = useMemo(() => {
    if (currentView === "all") return t("all");
    if (currentView === "favorites") return t("favorites");
    if (currentView === "archive") return t("archive");
    if (currentView === "trash") return t("trash");
    if (currentView === "smart_expiring_30d") return t("expiring");
    if (currentView === "smart_expired") return t("expired");
    if (currentView === "smart_no_2fa") return t("no2fa");
    if (currentView === "smart_reused_secrets") return t("reused");
    if (currentView === "smart_not_used_90d") return t("stale");
    if (currentView === "smart_no_project") return t("noProj");

    if (currentView.startsWith("project_")) {
      const pId = currentView.replace("project_", "");
      const p = projects.find((prj) => prj.id === pId);
      return p ? p.payload?.name : t("projects");
    }
    if (currentView.startsWith("cat_")) {
      const cId = currentView.replace("cat_", "");
      const c = categories.find((cat) => cat.id === cId);
      return c ? c.payload?.name : t("categories");
    }
    return t("all");
  }, [currentView, projects, categories, t]);

  const isProjectView = currentView.startsWith("project_");
  const currentProjectId = isProjectView ? currentView.replace("project_", "") : null;

  return (
    <section className="w-80 border-r rtl:border-r-0 rtl:border-l border-border bg-canvas-950 flex flex-col h-[calc(100vh-3.5rem)] select-none">
      {/* Header */}
      <div className="h-12 border-b border-border px-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <h2 className="text-xs font-bold text-text-primary truncate">{viewTitle}</h2>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-canvas-900 border border-border text-text-muted">
            {filteredItems.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isProjectView && (
            <button
              onClick={() => openModal("envExport", { projectId: currentProjectId })}
              className="text-[11px] font-medium px-2 py-1 rounded-lg bg-canvas-900 border border-border text-text-secondary hover:border-brand-500/40 transition flex items-center gap-1"
              title={t("exportEnv")}
            >
              <Download className="w-3 h-3 text-brand-400" />
              <span>.env</span>
            </button>
          )}

          <button
            onClick={() => openModal("itemEdit")}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("newItem")}</span>
          </button>
        </div>
      </div>

      {/* Items Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-8 text-text-muted">
            <div className="w-10 h-10 rounded-xl bg-canvas-900 border border-border flex items-center justify-center mb-2 text-text-muted">
              <Layers className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium text-text-muted mb-3">{t("noItems")}</p>
            <button
              onClick={() => openModal("itemEdit")}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-canvas-900 border border-border hover:border-brand-500/40 text-text-secondary transition flex items-center gap-1"
            >
              <Plus className="w-3 h-3 text-brand-400" />
              <span>{t("newItem")}</span>
            </button>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedItemId === item.id;
            const title = item.payload?.title || "Untitled";
            const tags = item.payload?.tags || [];
            const fieldsCount = item.payload?.fields?.length || 0;

            return (
              <div
                key={item.id}
                onClick={() => selectItem(item.id)}
                className={`p-2.5 rounded-xl border cursor-pointer transition text-left rtl:text-right ${
                  isSelected
                    ? "bg-canvas-900 border-brand-500/80 shadow-md border-l-4 rtl:border-l rtl:border-r-4"
                    : "bg-canvas-900/40 border-border hover:bg-canvas-900/80 hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {title}
                  </span>
                  {item.is_favorite && (
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-canvas-950 border border-border text-text-muted">
                    {fieldsCount} {lang === "ar" ? "حقول" : "fields"}
                  </span>
                  {tags.map((tg, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400 dir-ltr"
                    >
                      #{tg}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
