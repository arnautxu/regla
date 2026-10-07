"use client";

import { type FlowLevel } from "@/lib/db";
import { flowOptions } from "@/lib/labels";
import { haptic } from "@/lib/use-lilaila";
import { CHOICE_CLASS, choiceStyle } from "@/lib/choice";

/* Cinco niveles, un toque. Vive en Hoy mientras sangra (que es el
   registro más probable de esos días) y en la hoja del calendario
   para rellenar atrasados.

   Componente controlado: no escribe en la base de datos por su
   cuenta. Quien lo usa decide qué pasa con el valor — en la hoja del
   calendario se guarda al toque, pero en Hoy antes de confirmar es
   solo un borrador (ver app/page.tsx): tocar el flujo no puede
   contar el día por sí solo, o "Me ha bajado" deja de significar
   nada. */

export function FlowRow({
  value,
  onChange,
  dateKey,
  /**
   * El día anterior sangró, así que marcar "nada" aquí termina la
   * regla. Cambia la palabra del botón, no lo que escribe: en el
   * modelo las dos cosas son el mismo flujo 0.
   */
  endsPeriod = false,
  bare = false,
}: {
  value: FlowLevel | undefined;
  onChange: (value: FlowLevel | undefined) => void;
  dateKey: string;
  endsPeriod?: boolean;
  /** Sin título: en la hoja por pasos la pregunta ya lo dice en grande */
  bare?: boolean;
}) {
  const opciones = flowOptions(endsPeriod);

  return (
    <section aria-labelledby={bare ? undefined : `flow-${dateKey}`} aria-label={bare ? "Sangrado" : undefined}>
      {!bare && (
        <h3
          id={`flow-${dateKey}`}
          className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
        >
          Sangrado
        </h3>
      )}

      <div className={`${bare ? "" : "mt-1.5 "}grid grid-cols-5 gap-1.5`}>
        {opciones.map((opt) => {
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
              className={`flex ${bare ? "min-h-[84px] text-xs" : "min-h-[50px] text-2xs"} flex-col items-center justify-center gap-0.5 rounded-xl px-1 leading-[1.15] ${CHOICE_CLASS}`}
              style={choiceStyle(active)}
            >
              <Drops n={opt.value} active={active} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* Cuánto, sin leer: de una gota vacía (nada) a cuatro llenas. */
function Drops({ n, active }: { n: number; active: boolean }) {
  const color = active ? "var(--accent)" : "var(--ph-menstrual)";
  const count = Math.max(n, 1);
  return (
    <span aria-hidden="true" className="flex h-4 items-center gap-px">
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 24 30" width={n === 0 ? 11 : 8} height={n === 0 ? 14 : 11}>
          <path
            d="M12 2c0 0 9 11 9 16a9 9 0 1 1-18 0C3 13 12 2 12 2z"
            fill={n === 0 ? "none" : color}
            stroke={color}
            strokeWidth="2.6"
          />
        </svg>
      ))}
    </span>
  );
}
