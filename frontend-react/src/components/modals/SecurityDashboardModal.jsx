import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { useVault } from "../../context/VaultContext";
import { api } from "../../services/api";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  Clock,
  Archive,
  ArrowRight,
  ExternalLink,
  Loader2,
} from "lucide-react";

export function SecurityDashboardModal({ onClose }) {
  const { lang, selectItem, setCurrentView, showToast } = useVault();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("weak"); // weak | reused | no2fa | expired | stale

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        const res = await api("/security/dashboard");
        setData(res);
      } catch (err) {
        showToast(err.message || (lang === "ar" ? "تعذر تحميل فحص الأمان" : "Failed to load security audit"), "error");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [lang, showToast]);

  function handleJump(itemId) {
    onClose();
    selectItem(itemId);
  }

  const score = data?.overall_health_score ?? 100;
  let scoreColor = "text-emerald-400";
  let scoreBg = "bg-emerald-500/10 border-emerald-500/30";
  let scoreLabel = lang === "ar" ? "حالة الأمان ممتازة" : "Excellent Security";

  if (score < 50) {
    scoreColor = "text-rose-400";
    scoreBg = "bg-rose-500/10 border-rose-500/30";
    scoreLabel = lang === "ar" ? "يوجد مخاطر أمنية عالية" : "Critical Security Risks";
  } else if (score < 80) {
    scoreColor = "text-amber-400";
    scoreBg = "bg-amber-500/10 border-amber-500/30";
    scoreLabel = lang === "ar" ? "يحتاج إلى تحسينات" : "Needs Attention";
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={lang === "ar" ? "لوحة فحص الأمان والتهديدات" : "Vault Security & Health Audit"}
      subtitle={lang === "ar" ? "تحليل شامل لقوة التشفير، كلمات المرور المكررة، وحسابات 2FA" : "Comprehensive audit of credential hygiene, reuse, and 2FA coverage"}
      maxWidth="max-w-3xl"
    >
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
          <span className="text-xs">{lang === "ar" ? "جاري تدقيق وتحليل الخزنة..." : "Auditing vault items..."}</span>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header Score Banner */}
          <div className={`p-5 rounded-2xl border ${scoreBg} flex items-center justify-between gap-4`}>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {lang === "ar" ? "معدل سلامة الخزنة" : "Overall Vault Health"}
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-extrabold font-mono ${scoreColor}`}>{score}</span>
                <span className="text-xs text-text-muted">/ 100</span>
              </div>
              <p className={`text-xs font-medium ${scoreColor}`}>{scoreLabel}</p>
            </div>

            <div className="text-end text-xs text-text-muted max-w-xs hidden sm:block">
              {lang === "ar"
                ? "يتم احتساب النتيجة وفقاً لقوة التشفير، عدم تكرار الأسرار، وتفعيل المصادقة الثنائية وتحديث المفاتيح الدورية."
                : "Score is calculated from password entropy, secret duplication, 2FA coverage, and credential rotation."}
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                id: "weak",
                title: lang === "ar" ? "كلمات ضعيفة" : "Weak Secrets",
                count: data?.weak_secrets_count || 0,
                color: "text-rose-400",
                icon: <KeyRound className="w-4 h-4 text-rose-400" />,
              },
              {
                id: "reused",
                title: lang === "ar" ? "كلمات مكررة" : "Reused Secrets",
                count: data?.reused_secrets_count || 0,
                color: "text-amber-400",
                icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
              },
              {
                id: "no2fa",
                title: lang === "ar" ? "بدون 2FA" : "Missing 2FA",
                count: data?.no_2fa_count || 0,
                color: "text-blue-400",
                icon: <ShieldAlert className="w-4 h-4 text-blue-400" />,
              },
              {
                id: "expired",
                title: lang === "ar" ? "منتهية أو وشيكة" : "Expired / Soon",
                count: (data?.expired_count || 0) + (data?.expiring_soon_count || 0),
                color: "text-purple-400",
                icon: <Clock className="w-4 h-4 text-purple-400" />,
              },
            ].map((metric) => (
              <button
                key={metric.id}
                type="button"
                onClick={() => setActiveTab(metric.id)}
                className={`p-3 rounded-xl border text-start transition-all ${
                  activeTab === metric.id
                    ? "bg-canvas-950 border-brand-500 ring-1 ring-brand-500 shadow-md"
                    : "bg-canvas-950/60 border-border hover:bg-canvas-950 hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-text-muted">{metric.title}</span>
                  {metric.icon}
                </div>
                <div className={`text-xl font-bold font-mono ${metric.count > 0 ? metric.color : "text-text-muted"}`}>
                  {metric.count}
                </div>
              </button>
            ))}
          </div>

          {/* Details Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text-primary px-1">
              {activeTab === "weak" && (lang === "ar" ? "العناصر ذات كلمات المرور الضعيفة" : "Items with Weak Passwords")}
              {activeTab === "reused" && (lang === "ar" ? "العناصر ذات كلمات المرور المكررة" : "Items Sharing the Same Password")}
              {activeTab === "no2fa" && (lang === "ar" ? "حسابات لا تحتوي على مفتاح مصادقة 2FA" : "Accounts Missing Two-Factor Auth")}
              {activeTab === "expired" && (lang === "ar" ? "عناصر منتهية أو قاربت على الانتهاء" : "Expired or Expiring Credentials")}
            </h4>

            <div className="p-2 rounded-xl bg-canvas-950 border border-border max-h-56 overflow-y-auto custom-scrollbar space-y-1.5">
              {activeTab === "weak" && (
                data?.weak_secrets?.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted">{lang === "ar" ? "لا توجد كلمات مرور ضعيفة!" : "No weak passwords found!"}</div>
                ) : (
                  data?.weak_secrets?.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-900 border border-border/70 text-xs">
                      <div>
                        <span className="font-medium text-text-primary block">{it.title}</span>
                        <span className="text-[10px] text-text-muted">{it.field} (Score: {it.score}/4)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleJump(it.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-canvas-800 hover:bg-brand-600 hover:text-white text-text-secondary text-[11px] transition-colors"
                      >
                        <span>{lang === "ar" ? "تعديل" : "Edit"}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )
              )}

              {activeTab === "reused" && (
                data?.reused_secrets?.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted">{lang === "ar" ? "لا توجد كلمات مرور مكررة!" : "No reused secrets found!"}</div>
                ) : (
                  data?.reused_secrets?.map((group, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-canvas-900 border border-border/70 text-xs space-y-2">
                      <div className="font-mono text-amber-400 text-[11px]">{group.value_masked} (used across {group.occurrences.length} items):</div>
                      <div className="flex flex-wrap gap-2">
                        {group.occurrences.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => handleJump(it.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-canvas-800 hover:bg-brand-600 hover:text-white text-text-secondary text-[11px] transition-colors"
                          >
                            <span>{it.title}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )
              )}

              {activeTab === "no2fa" && (
                data?.no_2fa_items?.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted">{lang === "ar" ? "جميع الحسابات محمية بـ 2FA!" : "All accounts have 2FA enabled!"}</div>
                ) : (
                  data?.no_2fa_items?.map((it) => (
                    <div key={it.id} className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-900 border border-border/70 text-xs">
                      <span className="font-medium text-text-primary">{it.title}</span>
                      <button
                        type="button"
                        onClick={() => handleJump(it.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-canvas-800 hover:bg-brand-600 hover:text-white text-text-secondary text-[11px] transition-colors"
                      >
                        <span>{lang === "ar" ? "إضافة 2FA" : "Add 2FA"}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )
              )}

              {activeTab === "expired" && (
                (data?.expired_items?.length === 0 && data?.expiring_soon_items?.length === 0) ? (
                  <div className="p-4 text-center text-xs text-text-muted">{lang === "ar" ? "لا توجد عناصر منتهية الصلاحية!" : "No expired credentials!"}</div>
                ) : (
                  <>
                    {data?.expired_items?.map((it) => (
                      <div key={it.id} className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-900 border border-border/70 text-xs">
                        <div>
                          <span className="font-medium text-text-primary block">{it.title}</span>
                          <span className="text-[10px] text-rose-400">{lang === "ar" ? "منتهي منذ: " : "Expired: "}{new Date(it.expires_at).toLocaleDateString()}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleJump(it.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-canvas-800 hover:bg-brand-600 hover:text-white text-text-secondary text-[11px] transition-colors"
                        >
                          <span>{lang === "ar" ? "تجديد" : "Rotate"}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {data?.expiring_soon_items?.map((it) => (
                      <div key={it.id} className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-900 border border-border/70 text-xs">
                        <div>
                          <span className="font-medium text-text-primary block">{it.title}</span>
                          <span className="text-[10px] text-amber-400">{lang === "ar" ? "ينتهي قريباً: " : "Expiring: "}{new Date(it.expires_at).toLocaleDateString()}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleJump(it.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-canvas-800 hover:bg-brand-600 hover:text-white text-text-secondary text-[11px] transition-colors"
                        >
                          <span>{lang === "ar" ? "تجديد" : "Rotate"}</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </>
                )
              )}
            </div>
          </div>

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
      )}
    </Modal>
  );
}
