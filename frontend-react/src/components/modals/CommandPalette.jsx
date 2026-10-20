import React, { useState, useEffect, useMemo, useRef } from "react";
import { useVault } from "../../context/VaultContext";
import {
  Search,
  KeyRound,
  ShieldAlert,
  FileDown,
  Settings,
  Lock,
  Plus,
  FolderGit2,
  Tag,
  Key,
  Globe,
  Sun,
  Moon,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

export function CommandPalette({ onClose }) {
  const {
    items,
    projects,
    categories,
    selectItem,
    openModal,
    lockVault,
    toggleTheme,
    toggleLang,
    setCurrentView,
    lang,
    theme,
  } = useVault();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Define static quick actions
  const quickActions = useMemo(
    () => [
      {
        id: "act-new",
        type: "action",
        title: lang === "ar" ? "إضافة عنصر جديد" : "Create New Item",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <Plus className="w-4 h-4 text-brand-400" />,
        run: () => {
          onClose();
          openModal("itemEdit");
        },
      },
      {
        id: "act-gen",
        type: "action",
        title: lang === "ar" ? "مولد كلمات المرور والمفاتيح" : "Password & Key Generator",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <KeyRound className="w-4 h-4 text-emerald-400" />,
        run: () => {
          onClose();
          openModal("generator");
        },
      },
      {
        id: "act-sec",
        type: "action",
        title: lang === "ar" ? "فحص وتدقيق الأمان" : "Security Audit & Dashboard",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
        run: () => {
          onClose();
          openModal("security");
        },
      },
      {
        id: "act-ai-smart-import",
        type: "action",
        title: lang === "ar" ? "المساعد الذكي: استيراد بالذكاء الاصطناعي (AI Smart Import)" : "AI Smart Import & Redaction",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
        run: () => {
          onClose();
          openModal("import", { initialTab: "ai" });
        },
      },
      {
        id: "act-ai-settings",
        type: "action",
        title: lang === "ar" ? "إعدادات الذكاء الاصطناعي (LLM Settings)" : "AI / LLM Settings",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
        run: () => {
          onClose();
          openModal("settings", { initialTab: "llm" });
        },
      },
      {
        id: "act-imp",
        type: "action",
        title: lang === "ar" ? "استيراد ملفات (Bitwarden / CSV)" : "Import Secrets (Bitwarden / CSV)",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <FileDown className="w-4 h-4 text-blue-400" />,
        run: () => {
          onClose();
          openModal("import", { initialTab: "bitwarden" });
        },
      },
      {
        id: "act-settings",
        type: "action",
        title: lang === "ar" ? "إعدادات الخزنة والنسخ الاحتياطي" : "Vault Settings & Backup",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <Settings className="w-4 h-4 text-purple-400" />,
        run: () => {
          onClose();
          openModal("settings");
        },
      },
      {
        id: "act-theme",
        type: "action",
        title: theme === "dark" ? (lang === "ar" ? "الوضع النهاري" : "Switch to Light Mode") : (lang === "ar" ? "الوضع الليلي" : "Switch to Dark Mode"),
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />,
        run: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "act-lang",
        type: "action",
        title: lang === "ar" ? "Switch language to English" : "تغيير اللغة إلى العربية",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <Globe className="w-4 h-4 text-cyan-400" />,
        run: () => {
          toggleLang();
          onClose();
        },
      },
      {
        id: "act-lock",
        type: "action",
        title: lang === "ar" ? "قفل الخزنة ومسح الذاكرة" : "Lock Vault Now",
        category: lang === "ar" ? "إجراءات سريعة" : "Quick Actions",
        icon: <Lock className="w-4 h-4 text-rose-400" />,
        run: () => {
          onClose();
          lockVault();
        },
      },
    ],
    [lang, theme, onClose, openModal, toggleTheme, toggleLang, lockVault]
  );

  // Filter items and projects based on query
  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return quickActions;
    }

    const matchedItems = items
      .filter((it) => {
        if (it.deleted_at) return false;
        const title = (it.payload?.title || "").toLowerCase();
        const tags = (it.payload?.tags || []).join(" ").toLowerCase();
        const fields = (it.payload?.fields || []).map((f) => f.label || "").join(" ").toLowerCase();
        return title.includes(q) || tags.includes(q) || fields.includes(q);
      })
      .slice(0, 8)
      .map((it) => ({
        id: it.id,
        type: "item",
        title: it.payload?.title || "Untitled",
        subtitle: (it.payload?.tags || []).map((t) => `#${t}`).join(" "),
        category: lang === "ar" ? "العناصر" : "Vault Items",
        icon: <Key className="w-4 h-4 text-brand-400" />,
        run: () => {
          onClose();
          selectItem(it.id);
        },
      }));

    const matchedProjects = projects
      .filter((p) => (p.payload?.name || "").toLowerCase().includes(q))
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        type: "project",
        title: p.payload?.name,
        category: lang === "ar" ? "المشاريع" : "Projects",
        icon: <FolderGit2 className="w-4 h-4 text-blue-400" />,
        run: () => {
          onClose();
          setCurrentView(`project:${p.id}`);
        },
      }));

    const matchedActions = quickActions.filter((a) => a.title.toLowerCase().includes(q));

    return [...matchedItems, ...matchedProjects, ...matchedActions];
  }, [query, items, projects, quickActions, lang, onClose, selectItem, setCurrentView]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredResults.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          filteredResults[selectedIndex].run();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredResults, selectedIndex, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="relative w-full max-w-xl bg-canvas-900 border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-border bg-canvas-950/70">
          <Search className="w-4 h-4 text-text-muted shrink-0" strokeWidth={2} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "ar" ? "ابحث عن حساب، مشروع، أو أمر سريع..." : "Search items, projects, or commands..."}
            autoFocus
            className="w-full h-12 px-3 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-text-muted bg-canvas-800 rounded border border-border">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar space-y-1">
          {filteredResults.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-xs">
              {lang === "ar" ? "لا توجد نتائج مطابقة لبحثك" : "No matching results found"}
            </div>
          ) : (
            filteredResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.run()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                    isSelected
                      ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
                      : "text-text-primary hover:bg-canvas-800/60 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1 rounded-lg bg-canvas-950 border border-border shrink-0">
                      {item.icon}
                    </div>
                    <div className="truncate">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.subtitle && <div className="text-[10px] text-text-muted">{item.subtitle}</div>}
                    </div>
                  </div>

                  <span className="text-[10px] text-text-muted shrink-0 font-mono">
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-canvas-950/60 text-[11px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>↑↓ {lang === "ar" ? "للتنقل" : "Navigate"}</span>
            <span>↵ {lang === "ar" ? "للاختيار" : "Select"}</span>
          </div>
          <span>Secrets Vault Spotlight</span>
        </div>
      </div>
    </div>
  );
}
