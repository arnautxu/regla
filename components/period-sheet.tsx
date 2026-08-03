"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { fromKey, toKey } from "@/lib/db";
import { capitalize } from "@/lib/format";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   ¿CUÁNDO?

   La versión anterior era un interruptor que daba por hecho que
   registraba el mismo día. En la vida real se acuerda dos días tarde,
   y entonces el botón apuntaba la fecha equivocada sin avisar — o la
   obligaba a irse al calendario a buscar el día a mano.

   Ahora siempre pregunta cuándo, con hoy de primera opción. Cada
   opción enseña el día de la semana y el número al lado: "Ayer" solo
   no basta cuando son las dos de la mañana y no sabes si ya es otro
   día.
   ═══════════════════════════════════════════════════════════════ */

export type PeriodAction = "inicio" | "fin";

const COPY: Record<
  PeriodAction,
  { title: string; hint: string; relative: string[] }
> = {
  inicio: {
    title: "¿Qué día te bajó?",
    hint: "Si fue hace unos días, dímelo y lo cuadro bien.",
    relative: ["Hoy", "Ayer", "Hace 2 días", "Hace 3 días", "Hace 4 días"],
  },
  fin: {
    title: "¿Cuál fue el último día?",
    hint: "El último día que manchaste, no el primero que no.",
    relative: ["Hoy", "Ayer", "Hace 2 días", "Hace 3 días", "Hace 4 días"],
  },
};

export function PeriodSheet({
  action,
  todayKey,
  /** No se puede cerrar una regla antes de que empezara */
  minKey,
  onPick,
  onClose,
}: {
  action: PeriodAction | null;
  todayKey: string;
  minKey?: string;
  onPick: (dateKey: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (action && !el.open) el.showModal();
    if (!action && el.open) el.close();
  }, [action]);

  const copy = action ? COPY[action] : null;
  const base = fromKey(todayKey);

  const options = (copy?.relative ?? [])
    .map((label, i) => ({ label, date: addDays(base, -i), key: toKey(addDays(base, -i)) }))
    // Sin fechas imposibles: el fin de una regla no cae antes del inicio.
    .filter((o) => !minKey || o.key >= minKey);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // pointerdown y no click: el clic que ABRE la hoja termina de
      // procesarse cuando showModal() ya la ha puesto en la capa
      // superior, asi que su evento 'click' le llega al backdrop y la
      // cierra al instante. El pointerdown que la abrio ocurrio antes
      // de que el dialogo existiera, de modo que aqui solo entran
      // pulsaciones nuevas.
      onPointerDown={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="sheet"
      aria-label={copy?.title ?? ""}
    >
      {copy && (
        <div className="sheet-panel flex flex-col gap-lg px-lg pt-md">
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: "var(--border-strong)" }}
          />

          <header>
            <h2 className="font-display text-lg font-bold tracking-[-0.02em]">
              {copy.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{copy.hint}</p>
          </header>

          <ul className="flex flex-col gap-2">
            {options.map((opt, i) => (
              <li key={opt.key}>
                <button
                  type="button"
                  onClick={() => {
                    haptic([18, 40, 26]);
                    onPick(opt.key);
                    ref.current?.close();
                  }}
                  className="flex min-h-[56px] w-full items-center justify-between gap-md rounded-2xl px-4 text-left transition-[transform] duration-150 active:scale-[0.98]"
                  style={
                    // Solo la primera opción va rellena. Si todas
                    // pesaran igual, elegir "hoy" —que es el 90% de
                    // las veces— costaría lo mismo que pensar.
                    i === 0
                      ? { background: "var(--accent)", color: "var(--on-accent)" }
                      : { boxShadow: "inset 0 0 0 1px var(--border-strong)" }
                  }
                >
                  <span className="font-display text-base font-bold">
                    {opt.label}
                  </span>
                  {/* La fecha explícita al lado quita toda duda */}
                  <span
                    className="text-sm"
                    style={{ opacity: i === 0 ? 0.85 : 0.7 }}
                  >
                    {capitalize(format(opt.date, "EEEE d", { locale: es }))}
                  </span>
                </button>
              </li>
            ))}

            <li>
              <button
                type="button"
                onClick={() => {
                  haptic(10);
                  ref.current?.close();
                  router.push("/calendario");
                }}
                className="flex min-h-[52px] w-full items-center justify-center rounded-2xl px-4 text-sm text-muted"
                style={{ boxShadow: "inset 0 0 0 1px var(--border)" }}
              >
                Otro día — elegirlo en el calendario
              </button>
            </li>
          </ul>

          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-[44px] text-sm text-faint"
          >
            Cancelar
          </button>
        </div>
      )}
    </dialog>
  );
}
