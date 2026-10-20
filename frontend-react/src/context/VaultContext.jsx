import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api, fetchSessionToken, setOnLocked, setOnReauth } from "../services/api";
import { translations } from "../i18n/translations";

const VaultContext = createContext(null);

export function VaultProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem("vault_lang") || "ar");
  const [theme, setTheme] = useState(() => localStorage.getItem("vault_theme") || "dark");
  
  const [authStatus, setAuthStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentView, setCurrentView] = useState("all");
  
  const [toasts, setToasts] = useState([]);
  const [activeModal, setActiveModal] = useState(null); // { type, props }
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  
  const idleTimerRef = useRef(null);

  // Translation helper
  const t = useCallback((key) => {
    return (translations[lang] && translations[lang][key]) || key;
  }, [lang]);

  // Toast helper
  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
    localStorage.setItem("vault_theme", theme);
  }, [theme]);

  // Language & Direction effect
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("lang", lang);
    root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    localStorage.setItem("vault_lang", lang);
  }, [lang]);

  // Toggle helpers
  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  const toggleLang = () => setLang((prev) => (prev === "ar" ? "en" : "ar"));

  // Fetch data
  const loadVaultData = useCallback(async () => {
    try {
      const [itms, projs, cats, tpls] = await Promise.all([
        api("/items"),
        api("/projects"),
        api("/categories"),
        api("/templates"),
      ]);
      setItems(itms || []);
      setProjects(projs || []);
      setCategories(cats || []);
      setTemplates(tpls || []);
    } catch (e) {
      console.error("Failed to load vault data", e);
    }
  }, []);

  // Check auth status
  const checkStatus = useCallback(async () => {
    try {
      const status = await fetch("/auth/status").then((r) => r.json());
      setAuthStatus(status);
      if (status.initialized && status.unlocked) {
        await loadVaultData();
      }
      return status;
    } catch (e) {
      showToast(lang === "ar" ? "تعذر الاتصال بالخادم" : "Connection error", "error");
      return null;
    }
  }, [loadVaultData, showToast, lang]);

  // Bootstrap
  useEffect(() => {
    fetchSessionToken().then(() => {
      checkStatus();
    });

    setOnLocked(() => {
      setAuthStatus((prev) => prev ? { ...prev, unlocked: false } : prev);
      setSelectedItem(null);
      setSelectedItemId(null);
    });

    setOnReauth(() => {
      return new Promise((resolve) => {
        setActiveModal({
          type: "reauth",
          props: { resolve },
        });
      });
    });
  }, [checkStatus]);

  // Idle detection
  useEffect(() => {
    function resetIdle() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (autoLockMinutes > 0 && authStatus && authStatus.unlocked) {
        idleTimerRef.current = setTimeout(async () => {
          try {
            await api("/auth/lock", { method: "POST" });
            setAuthStatus((prev) => prev ? { ...prev, unlocked: false } : prev);
            setSelectedItem(null);
            setSelectedItemId(null);
            showToast(t("lock"), "info");
          } catch (e) {}
        }, autoLockMinutes * 60 * 1000);
      }
    }

    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("keydown", resetIdle);
    window.addEventListener("click", resetIdle);
    resetIdle();

    return () => {
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("keydown", resetIdle);
      window.removeEventListener("click", resetIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [autoLockMinutes, authStatus, showToast, t]);

  // Select Item
  const selectItem = useCallback(async (id) => {
    setSelectedItemId(id);
    if (!id) {
      setSelectedItem(null);
      return;
    }
    try {
      const it = await api(`/items/${id}`);
      setSelectedItem(it);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Lock Vault
  const lockVault = async () => {
    try {
      await api("/auth/lock", { method: "POST" });
      setAuthStatus((prev) => prev ? { ...prev, unlocked: false } : prev);
      setSelectedItem(null);
      setSelectedItemId(null);
      showToast(lang === "ar" ? "تم قفل الخزنة ومسح الذاكرة" : "Vault locked", "info");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Unlock Vault
  const unlockVault = async (masterPassword) => {
    try {
      const res = await api("/auth/unlock", {
        method: "POST",
        body: { master_password: masterPassword },
      });
      await checkStatus();
      showToast(lang === "ar" ? "تم فتح الخزنة بنجاح" : "Vault unlocked successfully", "success");
      return res;
    } catch (e) {
      await checkStatus();
      throw e;
    }
  };

  // Setup Vault
  const setupVault = async (masterPassword, passwordHint) => {
    try {
      const res = await api("/auth/setup", {
        method: "POST",
        body: { master_password: masterPassword, password_hint: passwordHint },
      });
      await checkStatus();
      showToast(lang === "ar" ? "تم إنشاء الخزنة بنجاح" : "Vault initialized", "success");
      return res;
    } catch (e) {
      throw e;
    }
  };

  return (
    <VaultContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        theme,
        toggleTheme,
        t,
        authStatus,
        checkStatus,
        items,
        projects,
        categories,
        templates,
        selectedItemId,
        selectedItem,
        selectItem,
        currentView,
        setCurrentView,
        loadVaultData,
        lockVault,
        unlockVault,
        setupVault,
        toasts,
        showToast,
        activeModal,
        openModal: (type, props = {}) => setActiveModal({ type, props }),
        closeModal: () => setActiveModal(null),
        autoLockMinutes,
        setAutoLockMinutes,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  return useContext(VaultContext);
}
