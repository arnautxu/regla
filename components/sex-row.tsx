"use client";

import { haptic } from "@/lib/use-lilaila";
import { CHOICE_CLASS, choiceStyle } from "@/lib/choice";
import type { DayLog, SexActivity, SexProtection } from "@/lib/db";
import { TagPicker } from "./tag-picker";

/* ═══════════════════════════════════════════════════════════════
   SEXO

   Primero sí o no, y el detalle solo si dice que sí. Enseñar de
   entrada "¿con condón?" a alguien que no ha follado es la clase de
   formulario que hace que la gente deje de registrar nada.

   Sobre el vocabulario: el de ella, no el del prospecto. "Marcha
   atrás" no es "coitus interruptus" y "sola" no es "autoestimulación".

   La protección es de selección múltiple porque en la vida real se
   solapan —está con la pastilla Y con condón— y porque "Nada" tiene
   que poder marcarse sin que sea un hueco silencioso: un día sin
   etiquetas no distingue "sin protección" de "no me apetece contarlo".
   ═══════════════════════════════════════════════════════════════ */

const ACTIVIDADES: { value: SexActivity; label: string }[] = [
  { value: "penetracion", label: "Con penetración" },
  { value: "oral", label: "Oral" },
  { value: "manos", label: "Manos" },
  { value: "juguetes", label: "Juguetes" },
  { value: "sola", label: "Sola" },
];

const PROTECCION: { value: SexProtection; label: string }[] = [
  { value: "pastilla", label: "Pastilla" },
  { value: "condon", label: "Condón" },
  { value: "marcha-atras", label: "Marcha atrás" },
  { value: "nada", label: "Nada" },
];

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

export function SexRow({
  log,
  onSet,
  onPatch,
  dateKey,
  only,
}: {
  /** Pintar solo el sí/no o solo el detalle, para colocarlos aparte */
  only?: "answer" | "detail";
  log: DayLog | undefined;
  /** Sí/no. Va aparte porque al decir que no hay que limpiar el detalle. */
  onSet: (yes: boolean | undefined) => void;
  onPatch: (patch: Partial<Omit<DayLog, "date">>) => void;
  dateKey: string;
}) {
  const yes = log?.sex === true;

  return (
    <section aria-labelledby={only === "detail" ? undefined : `sexo-${dateKey}`} aria-label={only === "detail" ? "Detalle del sexo" : undefined} className="flex flex-col gap-md">
      {only !== "detail" && (
      <div>
        <h3
          id={`sexo-${dateKey}`}
          className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
        >
          Sexo
        </h3>

        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {[
            { value: true, label: "Sí" },
            { value: false, label: "No" },
          ].map((opt) => {
            const active = log?.sex === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  haptic(active ? 6 : 12);
                  onSet(active ? undefined : opt.value);
                }}
                className={`min-h-[40px] rounded-xl px-1 text-sm font-medium leading-[1.15] ${CHOICE_CLASS}`}
                style={choiceStyle(active)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {yes && only !== "answer" && (
        <>
          <TagPicker
            label="Qué"
            options={ACTIVIDADES}
            selected={log?.sexActivities ?? []}
            onToggle={(v) =>
              onPatch({ sexActivities: toggle(log?.sexActivities, v) })
            }
          />

          <TagPicker
            label="Protección"
            options={PROTECCION}
            selected={log?.sexProtection ?? []}
            onToggle={(v) =>
              onPatch({ sexProtection: toggle(log?.sexProtection, v) })
            }
          />

          {/* Un chip suelto y no un TagPicker de uno: es una pregunta
              de sí o no, y una lista de una sola opción se lee como si
              faltaran las demás. */}
          <button
            type="button"
            aria-pressed={log?.sexOrgasm === true}
            onClick={() => {
              haptic(log?.sexOrgasm ? 6 : 14);
              onPatch({ sexOrgasm: log?.sexOrgasm ? undefined : true });
            }}
            className={`min-h-[40px] self-start rounded-full px-3.5 text-sm ${CHOICE_CLASS}`}
            style={choiceStyle(log?.sexOrgasm === true)}
          >
            Me corrí
          </button>
        </>
      )}
    </section>
  );
}
