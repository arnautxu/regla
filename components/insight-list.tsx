"use client";

import type { Insight, InsightKind } from "@/lib/insights";

/* Los avisos llevan color; los patrones y datos no. En una app sobre
   el cuerpo de alguien, teñir de rojo un dato neutro es alarmismo
   gratuito — y si todo grita, el aviso que sí importa se pierde. */

const MARK: Record<InsightKind, { label: string; accent: boolean }> = {
  aviso: { label: "Coméntalo con un médico", accent: true },
  patron: { label: "Patrón", accent: false },
  dato: { label: "Dato", accent: false },
};

export function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {insights.map((insight) => {
        const mark = MARK[insight.kind];
        return (
          <li
            key={insight.id}
            className="sticker-sm rounded-2xl px-lg py-4"
            style={{
              background: mark.accent ? "var(--accent-soft)" : "var(--surface)",
            }}
          >
            <p
              className="text-2xs font-semibold uppercase tracking-[0.14em]"
              style={{
                color: mark.accent ? "var(--accent)" : "var(--fg-faint)",
              }}
            >
              {mark.label}
            </p>

            <h3 className="mt-1.5 font-display text-base font-bold tracking-[-0.015em]">
              {insight.title}
            </h3>

            <p className="mt-1 text-sm leading-relaxed text-muted">
              {insight.detail}
            </p>

            {/* Los patrones y avisos declaran su base: uno sin decir
                sobre cuántas observaciones se calcula es una opinión
                con tipografía de dato. Los «dato» son descriptivos,
                no inferidos, y ahí la coletilla solo estorba. */}
            {insight.kind !== "dato" && (
              <p className="mt-1.5 text-xs text-faint">
                Sobre {insight.basis}{" "}
                {insight.basis === 1 ? "registro" : "registros"}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
