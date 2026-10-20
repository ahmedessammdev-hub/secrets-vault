import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { getSessionToken } from "../../services/api";
import { QrCode, ShieldCheck, Loader2 } from "lucide-react";

export function QrCodeModal({ itemId, fieldId, label, onClose }) {
  const { lang } = useVault();
  const [qrUrl, setQrUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    async function loadQr() {
      try {
        setLoading(true);
        const token = getSessionToken();
        const resp = await fetch(`/items/${itemId}/fields/${fieldId}/qr`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: window.location.origin,
          },
        });
        if (!resp.ok) throw new Error("Failed to load QR code");
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
        setQrUrl(objectUrl);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (itemId && fieldId) {
      loadQr();
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId, fieldId]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "رمز الاستجابة السريعة (2FA)" : "Authenticator QR Code"}
      subtitle={label || (lang === "ar" ? "المصادقة الثنائية" : "Two-Factor Authentication")}
      maxWidth="max-w-sm"
    >
      <div className="flex flex-col items-center text-center p-2">
        <div className="w-56 h-56 rounded-2xl bg-white p-3 flex items-center justify-center border border-border shadow-md mb-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              <span className="text-xs text-zinc-600">
                {lang === "ar" ? "جاري التوليد..." : "Generating QR..."}
              </span>
            </div>
          ) : error ? (
            <p className="text-xs text-rose-500 p-4">
              {lang === "ar" ? "تعذر توليد رمز QR" : "Could not generate QR code"}
            </p>
          ) : qrUrl ? (
            <img src={qrUrl} alt="2FA QR Code" className="w-full h-full object-contain" />
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted bg-canvas-950 px-3 py-2 rounded-xl border border-border">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.8} />
          <span>
            {lang === "ar"
              ? "امسح الرمز بواسطة Google Authenticator أو تطبيق 2FA المفضل لديك."
              : "Scan this code with Google Authenticator, 1Password, or Authy."}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full py-2 rounded-xl bg-canvas-800 hover:bg-canvas-700 text-xs font-medium text-text-primary transition-colors"
        >
          {lang === "ar" ? "إغلاق" : "Close"}
        </button>
      </div>
    </Modal>
  );
}
