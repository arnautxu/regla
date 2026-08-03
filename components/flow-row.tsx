"use client";

import { upsertDay, type DayLog, type FlowLevel } from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";

/* Cinco niveles, un toque. Vive en Hoy mientras sangra (que es el
   registro más probable de esos días) y en la hoja del calendario
   para rellenar atrasados. */

const FLOW: { value: FlowLevel; label: string }[] = [
  { value: 0, label: "Nada" },
  { value: 1, label: "Poco" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Mucho" },
  { value: 4, label: "Diluvio" },
];

export function FlowRow({
  day,
  dateKey,
}: {
  day: DayLog | undefined;
  dateKey: string;
}) {
  return (
    <section aria-labelledby={`flow-${dateKey}`}>
      <h3
        id={`flow-${dateKey}`}
        className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
      >
        Flujo
      </h3>

      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {FLOW.map((opt) => {
          const active = day?.flow === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                haptic(active ? 6 : 14);
                void upsertDay(dateKey, {
                  flow: active ? undefined : opt.value,
                });
              }}
              className="min-h-[46px] rounded-lg px-1 text-2xs font-medium leading-[1.15] transition-[transform,box-shadow,color] duration-150 active:scale-[0.96]"
              style={{
                // Sin relleno: en minimal el estado se dice con el
                // trazo y el color de texto, no pintando cajas.
                boxShadow: active
                  ? "inset 0 0 0 1.5px var(--accent)"
                  : "inset 0 0 0 1px var(--border-strong)",
                color: active ? "var(--accent)" : "var(--fg-muted)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
