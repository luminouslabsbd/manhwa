"use client";
import { useEffect, useState } from "react";
import { onToast, type ToastMessage } from "@/lib/toast";

const COLORS: Record<ToastMessage["type"], { bg: string; border: string; icon: string }> = {
  success: { bg: "rgba(34,197,94,.12)",  border: "rgba(34,197,94,.4)",  icon: "✅" },
  error:   { bg: "rgba(239,68,68,.12)",  border: "rgba(239,68,68,.4)",  icon: "❌" },
  warning: { bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.4)", icon: "⚠️" },
  info:    { bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.4)", icon: "ℹ️" },
};

const TEXT: Record<ToastMessage["type"], string> = {
  success: "#4ade80",
  error:   "#f87171",
  warning: "#fbbf24",
  info:    "#60a5fa",
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return onToast(t => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4500);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10, maxWidth: 380,
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type];
        return (
          <div key={t.id} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 16px", borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}`,
            backdropFilter: "blur(8px)",
            boxShadow: "0 4px 24px rgba(0,0,0,.4)",
            animation: "slideIn .2s ease",
            fontFamily: "inherit",
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
            <span style={{ fontSize: 13, color: TEXT[t.type], lineHeight: 1.5, flex: 1, fontWeight: 500 }}>{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: "none", border: "none", cursor: "pointer", color: TEXT[t.type], fontSize: 14, opacity: 0.6, padding: 0, flexShrink: 0 }}
            >✕</button>
          </div>
        );
      })}
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
