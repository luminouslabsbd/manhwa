"use client";
import { useState, type ReactNode } from "react";

export type TabDef = { id: string; label: string; hint?: string; content: ReactNode };

/**
 * Client-side tab shell for /admin/settings. Each `content` is a pre-rendered
 * React subtree (usually an RSC with its async data already resolved) passed
 * down from the server page — we just toggle visibility via display:none so
 * switching tabs stays local (no refetch) but all server data fetches happen
 * once on the initial page render.
 */
export default function SettingsTabs({ tabs, defaultTab }: { tabs: TabDef[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab && tabs.find((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div role="tablist" aria-label="Settings sections" style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        borderBottom: "1px solid var(--border)", paddingBottom: 2,
      }}>
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              title={t.hint}
              style={{
                padding: "9px 16px",
                borderRadius: "8px 8px 0 0",
                border: "1px solid var(--border)",
                borderBottom: isActive ? "1px solid var(--bg)" : "1px solid var(--border)",
                background: isActive ? "var(--bg)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text)",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                marginBottom: -1,
                transition: "color .1s",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
