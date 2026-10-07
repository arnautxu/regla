"use client";

import { haptic } from "@/lib/use-lilaila";
import { CHOICE_CLASS, choiceStyle } from "@/lib/choice";

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

/** "Bien", "Regular"... en palabras, igual que lo marca la fila. */
export function moodLabel(value: MoodValue | undefined): string | undefined {
  const key = activeKey(value);
  return OPTIONS.find((o) => o.key === key)?.label;
}

export function MoodRow({
  value,
  onChange,
  dateKey,
  bare = false,
}: {
  value: MoodValue | undefined;
  onChange: (patch: { painLevel: number | undefined; badDay: boolean }) => void;
  dateKey: string;
  /** Sin título y con botones grandes, para la hoja por pasos */
  bare?: boolean;
}) {
  const current = activeKey(value);

  return (
    <section aria-labelledby={bare ? undefined : `mood-${dateKey}`} aria-label={bare ? "Cómo va el día" : undefined}>
      {!bare && (
        <h3
          id={`mood-${dateKey}`}
          className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
        >
          Cómo va el día
        </h3>
      )}

      <div className={bare ? "grid grid-cols-2 gap-2" : "mt-1.5 grid grid-cols-4 gap-1.5"}>
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
              className={`${bare ? "min-h-[64px] text-base" : "min-h-[40px] text-xs"} rounded-xl px-1 font-medium leading-[1.15] ${CHOICE_CLASS}`}
              style={choiceStyle(active)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
