"use client";

import { type FlowLevel } from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";

/* Cinco niveles, un toque. Vive en Hoy mientras sangra (que es el
   registro más probable de esos días) y en la hoja del calendario
   para rellenar atrasados.

   Componente controlado: no escribe en la base de datos por su
   cuenta. Quien lo usa decide qué pasa con el valor — en la hoja del
   calendario se guarda al toque, pero en Hoy antes de confirmar es
   solo un borrador (ver app/page.tsx): tocar el flujo no puede
   contar el día por sí solo, o "Me ha bajado" deja de significar
   nada. */

const FLOW: { value: FlowLevel; label: string }[] = [
  { value: 0, label: "Nada" },
  { value: 1, label: "Poco" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Mucho" },
  { value: 4, label: "Diluvio" },
];

export function FlowRow({
  value,
  onChange,
  dateKey,
}: {
  value: FlowLevel | undefined;
  onChange: (value: FlowLevel | undefined) => void;
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
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                haptic(active ? 6 : 14);
                onChange(active ? undefined : opt.value);
              }}
              className="min-h-[46px] rounded-lg px-1 text-2xs font-medium leading-[1.15] transition-[transform,box-shadow,color] duration-150 active:scale-[0.96] active:translate-x-[1px] active:translate-y-[1px]"
              style={{
                background: active ? "var(--accent-soft)" : "var(--surface)",
                boxShadow: active
                  ? "inset 0 0 0 1.5px var(--accent), 2px 2px 0 0 var(--depth-shadow)"
                  : "var(--depth-sm)",
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
