import React from "react";
import { useVault } from "../../context/VaultContext";
import {
  Search,
  Key,
  Star,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Copy,
  History,
  Folder,
  FolderMinus,
  Tag,
  Archive,
  Trash2,
  Plus,
  Settings,
} from "lucide-react";

export default function Sidebar() {
  const {
    t,
    items,
    projects,
    categories,
    currentView,
    setCurrentView,
    openModal,
  } = useVault();

  // Counts
  const activeItems = items.filter((i) => !i.deleted_at && !i.is_archived);
  const favCount = items.filter((i) => !i.deleted_at && i.is_favorite).length;

  const NavItem = ({ viewId, icon: Icon, label, count, iconColor }) => {
    const isActive = currentView === viewId;
    return (
      <button
        onClick={() => setCurrentView(viewId)}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left rtl:text-right mb-0.5 ${
          isActive
            ? "bg-brand-500/10 text-brand-400 font-semibold border-l-2 rtl:border-l-0 rtl:border-r-2 border-brand-500"
            : "text-text-secondary hover:text-text-primary hover:bg-canvas-900"
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor || (isActive ? "text-brand-400" : "text-text-muted")}`} />
          <span className="truncate">{label}</span>
        </div>
        {count !== undefined && (
          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-canvas-900 border border-border text-text-muted">
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="w-64 border-r rtl:border-r-0 rtl:border-l border-border bg-canvas-950 flex flex-col h-[calc(100vh-3.5rem)] select-none">
      {/* Quick Search Trigger */}
      <div className="p-3 border-b border-border">
        <button
          onClick={() => openModal("palette")}
          className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-text-muted bg-canvas-900 border border-border rounded-xl hover:border-brand-500/40 hover:text-text-secondary transition"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <span>{t("searchPh")}</span>
          </div>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-canvas-850 text-text-muted border border-border">
            Ctrl+K
          </kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
        {/* Main Views */}
        <div>
          <NavItem viewId="all" icon={Key} label={t("all")} count={activeItems.length} />
          <NavItem viewId="favorites" icon={Star} label={t("favorites")} count={favCount} iconColor="text-amber-400" />
        </div>

        {/* Security Filters */}
        <div>
          <div className="px-2.5 mb-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            {t("securityFilters")}
          </div>
          <NavItem
            viewId="smart_expiring_30d"
            icon={Clock}
            label={t("expiring")}
            iconColor="text-amber-400"
          />
          <NavItem
            viewId="smart_expired"
            icon={AlertTriangle}
            label={t("expired")}
            iconColor="text-rose-400"
          />
          <NavItem
            viewId="smart_no_2fa"
            icon={ShieldAlert}
            label={t("no2fa")}
            iconColor="text-amber-400"
          />
          <NavItem
            viewId="smart_reused_secrets"
            icon={Copy}
            label={t("reused")}
            iconColor="text-rose-400"
          />
          <NavItem
            viewId="smart_not_used_90d"
            icon={History}
            label={t("stale")}
            iconColor="text-text-muted"
          />
          <NavItem
            viewId="smart_no_project"
            icon={FolderMinus}
            label={t("noProj")}
            iconColor="text-text-muted"
          />
        </div>

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              {t("projects")}
            </span>
            <button
              onClick={() => openModal("addProject")}
              className="text-text-muted hover:text-text-primary p-0.5 rounded hover:bg-canvas-900 transition"
              title="Add Project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {projects.map((proj) => (
            <NavItem
              key={proj.id}
              viewId={`project_${proj.id}`}
              icon={Folder}
              label={proj.payload?.name || "Project"}
              count={activeItems.filter((i) => i.project_id === proj.id).length}
            />
          ))}
        </div>

        {/* Categories */}
        <div>
          <div className="flex items-center justify-between px-2.5 mb-1">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              {t("categories")}
            </span>
            <button
              onClick={() => openModal("addCategory")}
              className="text-text-muted hover:text-text-primary p-0.5 rounded hover:bg-canvas-900 transition"
              title="Add Category"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCurrentView(`cat_${cat.id}`)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left rtl:text-right mb-0.5 ${
                currentView === `cat_${cat.id}`
                  ? "bg-brand-500/10 text-brand-400 font-semibold border-l-2 rtl:border-l-0 rtl:border-r-2 border-brand-500"
                  : "text-text-secondary hover:text-text-primary hover:bg-canvas-900"
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cat.payload?.color || "#38bdf8" }}
                />
                <span className="truncate">{cat.payload?.name}</span>
              </div>
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-canvas-900 border border-border text-text-muted">
                {activeItems.filter((i) => i.category_id === cat.id).length}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom System Views & Settings */}
        <div className="pt-2 border-t border-border mt-auto">
          <NavItem
            viewId="archive"
            icon={Archive}
            label={t("archive")}
            count={items.filter((i) => !i.deleted_at && i.is_archived).length}
          />
          <NavItem
            viewId="trash"
            icon={Trash2}
            label={t("trash")}
            count={items.filter((i) => i.deleted_at).length}
            iconColor="text-rose-400"
          />
          <button
            id="sidebar-settings-btn"
            type="button"
            onClick={() => openModal("settings")}
            className="w-full flex items-center justify-between px-2.5 py-2 mt-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-cyan-400 hover:bg-canvas-900 border border-transparent hover:border-cyan-500/20 transition-all text-left rtl:text-right group"
          >
            <div className="flex items-center gap-2.5">
              <Settings className="w-3.5 h-3.5 text-text-muted group-hover:text-cyan-400 group-hover:rotate-45 transition-transform" />
              <span className="font-medium text-text-primary">{t("settings") || "الإعدادات"}</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-canvas-900 border border-border text-text-muted group-hover:border-cyan-500/30">
              ⚙️
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
