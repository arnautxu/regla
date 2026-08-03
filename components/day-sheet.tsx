"use client";

import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  db,
  setBleeding,
  upsertDay,
  type MoodTag,
  type SymptomTag,
} from "@/lib/db";
import { capitalize } from "@/lib/format";
import { haptic } from "@/lib/use-lilaila";
import { FlowRow } from "./flow-row";
import { MoodRow } from "./mood-row";
import { TagPicker } from "./tag-picker";

/**
 * Lo mínimo que necesita la hoja. DayCell del calendario encaja aquí
 * sin conversión, y la pantalla de Hoy puede construirlo a mano para
 * abrir el día de hoy sin pasar por el calendario.
 */
export interface SheetDay {
  key: string;
  date: Date;
  isToday: boolean;
  isFuture: boolean;
}

/* Las diez etiquetas de síntoma y las siete de ánimo llevaban desde
   el primer día en el modelo de datos sin aparecer en ninguna
   pantalla. "Cómo me encuentro" se resumía en un número de dolor del
   0 al 10, que no distingue entre migraña y estar de mal humor. */

const SINTOMAS: { value: SymptomTag; label: string }[] = [
  { value: "retortijones", label: "Retortijones" },
  { value: "dolor-lumbar", label: "Lumbares" },
  { value: "tetas-doloridas", label: "Tetas" },
  { value: "migrana", label: "Migraña" },
  { value: "hinchazon", label: "Hinchazón" },
  { value: "cansancio", label: "Cansancio" },
  { value: "insomnio", label: "Insomnio" },
  { value: "antojos", label: "Antojos" },
  { value: "acne", label: "Acné" },
  { value: "cagalera", label: "Cagalera" },
];

const ANIMOS: { value: MoodTag; label: string }[] = [
  { value: "tranquila", label: "Tranquila" },
  { value: "feliz", label: "Feliz" },
  { value: "irritada", label: "Irritada" },
  { value: "llorona", label: "Llorona" },
  { value: "apatica", label: "Apática" },
  { value: "gremlin", label: "Gremlin" },
  { value: "cachonda", label: "Cachonda" },
];

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

export function DaySheet({
  day,
  onClose,
}: {
  day: SheetDay | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // <dialog> nativo: da trampa de foco, Escape y scroll bloqueado sin
  // escribirlos a mano, y todos suelen salir mal escritos a mano.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (day && !el.open) el.showModal();
    if (!day && el.open) el.close();
  }, [day]);

  const log = useLiveQuery(
    async () => (day ? ((await db.days.get(day.key)) ?? null) : null),
    [day?.key],
  );

  // Ya no se pregunta si es "el primer dia": se pregunta si ese dia
  // sangro. El inicio del ciclo lo deduce la app de la racha.
  const sangro = log?.flow !== undefined && log.flow > 0;

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
      aria-label={day ? format(day.date, "d 'de' MMMM", { locale: es }) : ""}
    >
      {day && (
        <div className="sheet-panel flex flex-col gap-lg px-lg pt-md">
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: "var(--border-strong)" }}
          />

          <header>
            <h2 className="font-display text-lg font-bold tracking-[-0.02em]">
              {/* date-fns da los días en minúscula en es; en un título
                  eso se lee como una errata. */}
              {capitalize(format(day.date, "EEEE d 'de' MMMM", { locale: es }))}
            </h2>
            {day.isToday && <p className="text-xs text-faint">Hoy</p>}
          </header>

          {day.isFuture ? (
            <p className="text-sm leading-relaxed text-muted">
              Este día todavía no ha pasado. Cuando llegue me cuentas.
            </p>
          ) : (
            <>
              <FlowRow day={log ?? undefined} dateKey={day.key} />
              <MoodRow day={log ?? undefined} dateKey={day.key} />

              <TagPicker
                label="Qué te duele"
                options={SINTOMAS}
                selected={log?.symptoms ?? []}
                onToggle={(v) =>
                  void upsertDay(day.key, {
                    symptoms: toggle(log?.symptoms, v),
                  })
                }
              />

              <TagPicker
                label="Cómo estás de ánimo"
                options={ANIMOS}
                selected={log?.mood ?? []}
                onToggle={(v) =>
                  void upsertDay(day.key, { mood: toggle(log?.mood, v) })
                }
              />

              <section>
                <label
                  htmlFor={`nota-${day.key}`}
                  className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
                >
                  Nota
                </label>
                <textarea
                  id={`nota-${day.key}`}
                  defaultValue={log?.note ?? ""}
                  onBlur={(e) =>
                    void upsertDay(day.key, {
                      note: e.target.value.trim() || undefined,
                    })
                  }
                  rows={2}
                  placeholder="Lo que quieras acordarte"
                  className="mt-2 w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: "var(--bg)", boxShadow: "var(--depth-sm)" }}
                />
              </section>

              <button
                type="button"
                onClick={() => {
                  haptic([14, 30, 20]);
                  void setBleeding(day.key, !sangro);
                }}
                className="min-h-[52px] w-full rounded-full px-lg font-display text-base font-bold tracking-[-0.01em] transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
                style={
                  sangro
                    ? {
                        background: "transparent",
                        color: "var(--fg-muted)",
                        boxShadow: "var(--depth-sm)",
                      }
                    : {
                        background: "var(--accent)",
                        color: "var(--on-accent)",
                        boxShadow: "3px 3px 0 0 var(--depth-shadow)",
                      }
                }
              >
                {/* Mismo vocabulario que el botón de Hoy. Antes una
                    pantalla decía "me ha bajado" y la otra "primer día
                    de regla", y "quitar como primer día" es jerga. */}
                {sangro ? "Este día no sangré" : "Este día sí sangré"}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-[44px] text-sm text-faint"
          >
            Cerrar
          </button>
        </div>
      )}
    </dialog>
  );
}
