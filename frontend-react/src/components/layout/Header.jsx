import React from "react";
import { useVault } from "../../context/VaultContext";
import {
  Shield,
  ShieldCheck,
  Download,
  Upload,
  KeyRound,
  Settings,
  Sun,
  Moon,
  Lock,
  Globe,
  Sparkles,
} from "lucide-react";

export default function Header() {
  const {
    t,
    lang,
    toggleLang,
    theme,
    toggleTheme,
    authStatus,
    lockVault,
    openModal,
  } = useVault();

  const backupHealth = authStatus?.backup_health || "ok";
  const daysSinceBackup = authStatus?.days_since_backup;

  const getHealthText = () => {
    if (backupHealth === "ok") {
      return daysSinceBackup !== null && daysSinceBackup !== undefined
        ? `${t("backupHealthy")} (${daysSinceBackup} ${t("days")})`
        : t("backupHealthy");
    }
    if (backupHealth === "warning") {
      return `${t("backupWarning")} (${daysSinceBackup} ${t("days")})`;
    }
    return t("backupDanger");
  };

  const getHealthDotColor = () => {
    if (backupHealth === "ok") return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]";
    if (backupHealth === "warning") return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]";
    return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]";
  };

  return (
    <header className="h-14 border-b border-border bg-canvas-900/95 backdrop-blur-md px-4 flex items-center justify-between z-20 select-none">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
          <Shield className="w-4 h-4 stroke-[2]" />
        </div>
        <span className="font-bold text-base tracking-tight text-text-primary">
          {t("appTitle")}
        </span>
      </div>

      {/* Center / Quick Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Backup Status Pill */}
        <div
          onClick={() => openModal("settings")}
          className="cursor-pointer text-xs font-medium px-2.5 py-1 rounded-full border border-border bg-canvas-950 hover:border-brand-500/40 flex items-center gap-2 text-text-secondary transition"
        >
          <span className={`w-2 h-2 rounded-full ${getHealthDotColor()}`} />
          <span className="hidden md:inline">{getHealthText()}</span>
        </div>

        {/* AI Assistant & Smart Import */}
        <button
          onClick={() => openModal("import", { initialTab: "ai" })}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1.5 shadow-sm shadow-cyan-500/10"
          title={t("aiAssistant")}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="hidden sm:inline">{t("aiAssistant")}</span>
        </button>

        {/* Security Audit */}
        <button
          onClick={() => openModal("security")}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-canvas-950 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1.5"
          title={t("secDash")}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
          <span className="hidden lg:inline">{t("secDash")}</span>
        </button>

        {/* Import Files */}
        <button
          onClick={() => openModal("import", { initialTab: "bitwarden" })}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-canvas-950 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1.5"
          title={t("smartImport")}
        >
          <Upload className="w-3.5 h-3.5 text-brand-400" />
          <span className="hidden lg:inline">{t("smartImport")}</span>
        </button>

        {/* Generator */}
        <button
          onClick={() => openModal("generator")}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-canvas-950 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition flex items-center gap-1.5"
          title={t("genBtn")}
        >
          <KeyRound className="w-3.5 h-3.5 text-brand-400" />
          <span className="hidden md:inline">{t("genBtn")}</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => openModal("settings")}
          className="p-1.5 rounded-lg border border-border bg-canvas-950 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition"
          title={t("settings")}
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg border border-border bg-canvas-950 hover:bg-canvas-800 text-text-secondary hover:text-text-primary transition"
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>

        {/* Lang Toggle */}
        <button
          onClick={toggleLang}
          className="px-2.5 py-1 rounded-lg border border-border bg-canvas-950 hover:bg-canvas-800 text-xs font-medium text-text-secondary hover:text-text-primary transition flex items-center gap-1"
          title="Switch Language"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{lang === "ar" ? "EN" : "العربية"}</span>
        </button>

        {/* Lock Vault Button */}
        <button
          onClick={lockVault}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition flex items-center gap-1.5"
          title={t("lock")}
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("lock")}</span>
        </button>
      </div>
    </header>
  );
}
