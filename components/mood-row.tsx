"use client";

import { haptic } from "@/lib/use-lilaila";

/* Cuatro botones, un toque, se acabó. Un slider de dolor del 0 al 10
   es un juguete de diseñador: nadie calibra su sufrimiento con
   precisión decimal a las tres de la mañana.

   El último botón es el freno de mano de Lilita. Está a la vista a
   propósito: tiene que ser tan fácil callarla como registrar nada.

   Componente controlado, igual que FlowRow: no escribe en la base de
   datos por su cuenta. */

const OPTIONS = [
  { key: "bien", label: "Bien", pain: 0, bad: false },
  { key: "regular", label: "Regular", pain: 4, bad: false },
  { key: "mal", label: "Mal", pain: 7, bad: false },
  { key: "mierda", label: "De mierda", pain: 9, bad: true },
] as const;

type MoodValue = { painLevel?: number; badDay?: boolean };

function activeKey(value: MoodValue | undefined) {
  if (!value || value.painLevel === undefined) return undefined;
  if (value.badDay) return "mierda";
  if (value.painLevel >= 7) return "mal";
  if (value.painLevel >= 3) return "regular";
  return "bien";
}

export function MoodRow({
  value,
  onChange,
  dateKey,
}: {
  value: MoodValue | undefined;
  onChange: (patch: { painLevel: number | undefined; badDay: boolean }) => void;
  dateKey: string;
}) {
  const current = activeKey(value);

  return (
    <section aria-labelledby={`mood-${dateKey}`}>
      <h3
        id={`mood-${dateKey}`}
        className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
      >
        Cómo va el día
      </h3>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {OPTIONS.map((opt) => {
          const active = current === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                haptic(active ? 6 : 14);
                onChange({
                  painLevel: active ? undefined : opt.pain,
                  badDay: active ? false : opt.bad,
                });
              }}
              className="min-h-[46px] rounded-lg px-1 text-xs font-medium leading-[1.15] transition-[transform,box-shadow,color] duration-150 active:scale-[0.96] active:translate-x-[1px] active:translate-y-[1px]"
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
