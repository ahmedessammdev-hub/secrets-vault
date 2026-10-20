import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import { Copy, Check, RefreshCw, KeyRound, Shield, Sliders } from "lucide-react";

export function GeneratorModal({ onSelect, onClose }) {
  const { lang, showToast } = useVault();
  const [activeTab, setActiveTab] = useState("password"); // password | passphrase | apikey

  // Password Options
  const [passLength, setPassLength] = useState(24);
  const [useSymbols, setUseSymbols] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(true);

  // Passphrase Options
  const [wordCount, setWordCount] = useState(5);
  const [separator, setSeparator] = useState("-");

  // API Key Options
  const [prefix, setPrefix] = useState("sk_live_");
  const [format, setFormat] = useState("alphanumeric");
  const [keyLength, setKeyLength] = useState(32);

  // Result state
  const [generatedValue, setGeneratedValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "password") {
        const res = await api("/generator/password", {
          method: "POST",
          body: {
            length: passLength,
            symbols: useSymbols,
            digits: useDigits,
            avoid_ambiguous: avoidAmbiguous,
          },
        });
        setGeneratedValue(res.password || "");
      } else if (activeTab === "passphrase") {
        const res = await api("/generator/passphrase", {
          method: "POST",
          body: {
            words_count: wordCount,
            separator,
          },
        });
        setGeneratedValue(res.passphrase || "");
      } else if (activeTab === "apikey") {
        const res = await api("/generator/api-key", {
          method: "POST",
          body: {
            prefix: prefix || "",
            format,
            bytes_length: keyLength,
          },
        });
        setGeneratedValue(res.api_key || "");
      }
    } catch (err) {
      showToast(err.message || (lang === "ar" ? "تعذر التوليد" : "Generation failed"), "error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, passLength, useSymbols, useDigits, avoidAmbiguous, wordCount, separator, prefix, format, keyLength, lang, showToast]);

  useEffect(() => {
    generate();
  }, [generate]);

  async function handleCopy() {
    if (!generatedValue) return;
    try {
      await navigator.clipboard.writeText(generatedValue);
      setCopied(true);
      showToast(lang === "ar" ? "تم النسخ إلى الحافظة" : "Copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      showToast("Copy failed", "error");
    }
  }

  function handleSelect() {
    if (onSelect && generatedValue) {
      onSelect(generatedValue);
      onClose();
    }
  }

  // Calculate rough entropy
  let entropyBits = 0;
  if (activeTab === "password") {
    let pool = 26 + 26; // lower + upper
    if (useDigits) pool += 10;
    if (useSymbols) pool += 32;
    entropyBits = Math.round(passLength * Math.log2(pool));
  } else if (activeTab === "passphrase") {
    entropyBits = Math.round(wordCount * 12.9); // ~7776 wordlist
  } else {
    entropyBits = keyLength * 5;
  }

  let entropyColor = "text-emerald-400";
  let entropyLabel = lang === "ar" ? "قوة تشفير ممتازة" : "Excellent Entropy";
  if (entropyBits < 60) {
    entropyColor = "text-rose-400";
    entropyLabel = lang === "ar" ? "ضعيف" : "Weak";
  } else if (entropyBits < 90) {
    entropyColor = "text-amber-400";
    entropyLabel = lang === "ar" ? "جيد" : "Good";
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "مولد كلمات المرور والمفاتيح المشفرة" : "Cryptographic Secret Generator"}
      subtitle={lang === "ar" ? "توليد قيم آمنة عشوائية مشفرة باستخدام CSPRNG" : "Cryptographically secure random values via CSPRNG"}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-canvas-950 p-1 border border-border">
          {[
            { id: "password", label: lang === "ar" ? "كلمة مرور" : "Password" },
            { id: "passphrase", label: lang === "ar" ? "عبارة مرور" : "Passphrase" },
            { id: "apikey", label: lang === "ar" ? "مفتاح برمجي" : "API Key" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-canvas-800 text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Display Output Card */}
        <div className="p-4 rounded-xl bg-canvas-950 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-text-muted">
              {entropyBits} bits • <span className={entropyColor}>{entropyLabel}</span>
            </span>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-canvas-800 transition-colors"
              title="Regenerate"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="p-3 rounded-lg bg-canvas-900 border border-border/80 font-mono text-sm text-text-primary break-all select-all tracking-wide min-h-[46px] flex items-center">
            {generatedValue || "..."}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 h-9 rounded-lg bg-canvas-800 hover:bg-canvas-700 text-text-primary text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ" : "Copy")}</span>
            </button>
            {onSelect && (
              <button
                type="button"
                onClick={handleSelect}
                className="flex-1 h-9 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-brand-600/20"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "استخدام هذه القيمة" : "Use Secret"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Specific Controls */}
        {activeTab === "password" && (
          <div className="space-y-3 p-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{lang === "ar" ? "الطول:" : "Length:"}</span>
                <span className="font-mono text-brand-400 font-semibold">{passLength}</span>
              </div>
              <input
                type="range"
                min="8"
                max="64"
                value={passLength}
                onChange={(e) => setPassLength(Number(e.target.value))}
                className="w-full h-1.5 bg-canvas-950 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSymbols}
                  onChange={(e) => setUseSymbols(e.target.checked)}
                  className="rounded border-border bg-canvas-950 text-brand-500 focus:ring-0"
                />
                <span>{lang === "ar" ? "رموز خاصة (!@#$)" : "Symbols (!@#$)"}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDigits}
                  onChange={(e) => setUseDigits(e.target.checked)}
                  className="rounded border-border bg-canvas-950 text-brand-500 focus:ring-0"
                />
                <span>{lang === "ar" ? "أرقام (0-9)" : "Numbers (0-9)"}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer col-span-2">
                <input
                  type="checkbox"
                  checked={avoidAmbiguous}
                  onChange={(e) => setAvoidAmbiguous(e.target.checked)}
                  className="rounded border-border bg-canvas-950 text-brand-500 focus:ring-0"
                />
                <span>{lang === "ar" ? "تجنب الأحرف المتشابهة (l, 1, I, O, 0)" : "Avoid Ambiguous Characters (l, 1, I, O, 0)"}</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === "passphrase" && (
          <div className="space-y-3 p-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{lang === "ar" ? "عدد الكلمات:" : "Word Count:"}</span>
                <span className="font-mono text-brand-400 font-semibold">{wordCount}</span>
              </div>
              <input
                type="range"
                min="3"
                max="10"
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
                className="w-full h-1.5 bg-canvas-950 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-xs font-medium text-text-secondary">
                {lang === "ar" ? "الفاصل بين الكلمات" : "Separator"}
              </label>
              <div className="flex gap-2">
                {[
                  { id: "-", label: "Hyphen (-)" },
                  { id: ".", label: "Dot (.)" },
                  { id: "_", label: "Underscore (_)" },
                  { id: " ", label: "Space ( )" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeparator(s.id)}
                    className={`flex-1 py-1 text-xs font-mono rounded-lg border transition-colors ${
                      separator === s.id
                        ? "border-brand-500 bg-brand-500/10 text-brand-400"
                        : "border-border bg-canvas-950 text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "apikey" && (
          <div className="space-y-3 p-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  {lang === "ar" ? "البادئة (Prefix)" : "Prefix"}
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="sk_live_"
                  className="w-full h-9 px-3 text-xs font-mono bg-canvas-950 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  {lang === "ar" ? "الصيغة" : "Format"}
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-canvas-950 border border-border rounded-xl text-text-primary focus:outline-none focus:border-brand-500"
                >
                  <option value="alphanumeric">Alphanumeric (Base62)</option>
                  <option value="hex">Hexadecimal (0-9, a-f)</option>
                  <option value="base64">Base64URL</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{lang === "ar" ? "طول المحتوى:" : "Key Length:"}</span>
                <span className="font-mono text-brand-400 font-semibold">{keyLength} bytes</span>
              </div>
              <input
                type="range"
                min="16"
                max="64"
                value={keyLength}
                onChange={(e) => setKeyLength(Number(e.target.value))}
                className="w-full h-1.5 bg-canvas-950 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div className="flex items-center justify-end pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-800 transition-colors"
          >
            {lang === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
