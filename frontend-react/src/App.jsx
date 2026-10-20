import React, { useEffect } from "react";
import { VaultProvider, useVault } from "./context/VaultContext";
import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import ItemsList from "./components/layout/ItemsList";
import ItemDetail from "./components/layout/ItemDetail";
import { LockScreen } from "./components/auth/LockScreen";
import { SetupScreen } from "./components/auth/SetupScreen";
import { ModalRouter } from "./components/modals/ModalRouter";
import { ToastContainer } from "./components/common/Toast";
import { Shield, Loader2 } from "lucide-react";

function MainDashboard() {
  const { authStatus, openModal, lockVault } = useVault();

  // Global hotkeys
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openModal("palette");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lockVault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        openModal("import", { initialTab: "ai" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openModal, lockVault]);

  // Loading state
  if (!authStatus) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-canvas-950 text-text-primary gap-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
          <Shield className="w-6 h-6" strokeWidth={1.8} />
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          <span>Connecting to Vault...</span>
        </div>
      </div>
    );
  }

  // Not initialized
  if (!authStatus.initialized) {
    return <SetupScreen />;
  }

  // Locked
  if (!authStatus.unlocked) {
    return <LockScreen />;
  }

  // Main 3-column Workspace
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-canvas-950 text-text-primary font-sans">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        <Sidebar />
        <ItemsList />
        <ItemDetail />
      </main>
      <ModalRouter />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <VaultProvider>
      <MainDashboard />
    </VaultProvider>
  );
}
