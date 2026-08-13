"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  db,
  fromKey,
  pillStreak,
  setPill,
  setSex,
  toKey,
  upsertDay,
} from "@/lib/db";
import { summarize, type DaySummary } from "@/lib/day-summary";
import { ANIMOS, SINTOMAS } from "@/lib/labels";
import { capitalize } from "@/lib/format";
import { haptic, useLilaila } from "@/lib/use-lilaila";
import { FlowRow } from "./flow-row";
import { MoodRow } from "./mood-row";
import { PillRow } from "./pill-row";
import { SexRow } from "./sex-row";
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

function Resumen({ resumen }: { resumen: DaySummary }) {
  if (!resumen.lineas.length && !resumen.nota) {
    return (
      <p className="text-sm text-muted">Aquí no hay nada apuntado todavía.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {resumen.lineas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {resumen.lineas.map((l) => (
            <li key={l} className="text-sm leading-relaxed">
              {l}
            </li>
          ))}
        </ul>
      )}

      {/* La nota, como cita y no como dato: la escribió ella, y
          alinearla con "Pastilla tomada a las 22:04" la convertiría
          en una fila más de un parte médico. */}
      {resumen.nota && (
        <p
          className="border-l-2 pl-3 text-sm italic leading-relaxed text-muted"
          style={{ borderColor: "var(--border-strong)" }}
        >
          {resumen.nota}
        </p>
      )}
    </div>
  );
}

/** El día de al lado, en clave 'YYYY-MM-DD'. */
function vecino(key: string, delta: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

export function DaySheet({
  day,
  onClose,
  onPeriodStart,
}: {
  day: SheetDay | null;
  onClose: () => void;
  /**
   * Ha empezado una regla nueva aquí dentro.
   *
   * Se avisa al CERRAR y no al marcarlo: el efecto es Lilita cruzando
   * la pantalla entera, y esta hoja es un <dialog> modal — o sea, la
   * capa superior del navegador. Lanzarlo con la hoja abierta sería
   * animar algo por detrás de ella que no se ve.
   */
  onPeriodStart?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { settings, cycles } = useLilaila();
  const empezoRegla = useRef(false);

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

  // La racha necesita todos los días, así que solo se calcula con la
  // hoja abierta y la pastilla encendida. Sin esas dos guardas, cada
  // celda del calendario tendría detrás una consulta a la tabla entera.
  const streak = useLiveQuery(
    async () =>
      day && settings.pill.enabled
        ? pillStreak(await db.days.toArray(), day.key)
        : 0,
    [day?.key, settings.pill.enabled],
  );

  // El detalle empieza plegado SIEMPRE, también en un día que ya
  // tiene cosas: para verlas está el resumen, y abrirlo de golpe
  // devolvería la pared de controles que esto viene a quitar.
  //
  // Se ajusta DURANTE el render y no en un efecto: es el patrón que
  // documenta React para "resetear estado cuando cambia una prop", y
  // el efecto además repintaba una vez de más — se veía el detalle
  // del día anterior abierto durante un fotograma al saltar de día.
  const [abierto, setAbierto] = useState(false);
  const [ultimaClave, setUltimaClave] = useState(day?.key);
  if (day?.key !== ultimaClave) {
    setUltimaClave(day?.key);
    setAbierto(false);
  }

  const resumen = useMemo(
    () => summarize(log ?? undefined, day?.key ?? "", cycles),
    [log, day?.key, cycles],
  );

  /* ¿Marcar "nada" aquí termina la regla?
     Solo si el día ANTERIOR sangró y el SIGUIENTE no.

     Lo de mirar el siguiente no es un detalle: el modelo tolera un
     día de pausa dentro de la misma regla (MAX_GAP), así que en un
     día con sangre a los dos lados marcar 0 no acaba nada — la racha
     lo salta y sigue. Sin esa comprobación, el botón prometía un
     final que no iba a ocurrir cada vez que ella corrigiera un día
     de en medio. */
  const vecinos = useLiveQuery(
    async () =>
      day
        ? {
            ayer: (await db.days.get(vecino(day.key, -1)))?.flow,
            manyana: (await db.days.get(vecino(day.key, 1)))?.flow,
          }
        : null,
    [day?.key],
  );
  const terminaLaRegla = Boolean(
    vecinos?.ayer && vecinos.ayer > 0 && !(vecinos.manyana && vecinos.manyana > 0),
  );

  return (
    <dialog
      ref={ref}
      onClose={() => {
        onClose();
        if (empezoRegla.current) {
          empezoRegla.current = false;
          onPeriodStart?.();
        }
      }}
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
            <p className="text-xs text-faint">
              {[day.isToday ? "Hoy" : null, resumen.estado]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          {day.isFuture ? (
            <p className="text-sm leading-relaxed text-muted">
              Este día todavía no ha pasado. Cuando llegue me cuentas.
            </p>
          ) : (
            <>
              {/* ── Lo que pasó ese día ─────────────────────────
                  Primero lo que hay, en frases. Antes esto abría con
                  seis controles y para saber qué había apuntado
                  tenías que ir leyendo qué botón estaba encendido en
                  cada fila: la ficha contestaba "¿qué quieres
                  cambiar?" cuando la pregunta al tocar un día es
                  "¿qué pasó aquí?". */}
              <Resumen resumen={resumen} />

              {/* El sangrado se queda siempre fuera del desplegable.
                  Es el 90% de lo que se viene a hacer aquí, y
                  esconderlo tras un "añadir más" sería cobrarle un
                  toque extra al gesto más frecuente de la app. */}
              <FlowRow
                value={log?.flow}
                onChange={(v) => {
                  // Empieza una regla NUEVA: ni ese día sangraba ya ni
                  // hay ninguna abierta. Es el único caso que merece
                  // la fanfarria; los días siguientes son continuar.
                  const yaSangraba = log?.flow !== undefined && log.flow > 0;
                  const ultima = cycles[cycles.length - 1];
                  if (v !== undefined && v > 0 && !yaSangraba && !(ultima && !ultima.endDate)) {
                    empezoRegla.current = true;
                  }
                  void upsertDay(day.key, { flow: v });
                }}
                dateKey={day.key}
                endsPeriod={terminaLaRegla}
              />

              <button
                type="button"
                onClick={() => {
                  haptic(8);
                  setAbierto((v) => !v);
                }}
                aria-expanded={abierto}
                className="-ml-1 flex min-h-[44px] items-center gap-1.5 self-start px-1 text-sm"
                style={{ color: "var(--fg-muted)" }}
              >
                {abierto ? "Ocultar el detalle" : "Añadir o cambiar detalles"}
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 transition-transform duration-150"
                  style={{ transform: abierto ? "rotate(180deg)" : "none" }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 9l7 7 7-7" />
                </svg>
              </button>
            </>
          )}

          {!day.isFuture && abierto && (
            <>
              <MoodRow
                value={log ?? undefined}
                onChange={(patch) => void upsertDay(day.key, patch)}
                dateKey={day.key}
              />

              {/* La pastilla va arriba del todo del detalle: es lo
                  único de esta hoja que se pregunta TODOS los días,
                  sangre o no, y enterrarla bajo diez síntomas la
                  convertiría en algo que solo se rellena en marzo. */}
              {settings.pill.enabled && (
                <PillRow
                  value={log?.pill}
                  takenAt={log?.pillAt}
                  streak={streak}
                  onChange={(v) =>
                    void setPill(day.key, v, day.isToday ? new Date() : undefined)
                  }
                  dateKey={day.key}
                />
              )}

              <SexRow
                log={log ?? undefined}
                onSet={(v) => void setSex(day.key, v)}
                onPatch={(patch) => void upsertDay(day.key, patch)}
                dateKey={day.key}
              />

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

            </>
          )}

          {/* "Guardar" y no "Cerrar", aunque no guarde nada: cada
              toque ya escribe al momento, así que al llegar aquí el
              día está guardado desde hace rato. La etiqueta no miente
              —al pulsarla, está guardado— y evita la duda de si
              cerrar se lleva por delante lo que acabas de marcar,
              que es justo lo que un botón llamado "Cerrar" sugiere.

              La nota es el único campo que escribe al perder el foco,
              y el blur ocurre antes que el click, así que llega. */}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-[52px] w-full rounded-full px-lg font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              boxShadow: "3px 3px 0 0 var(--depth-shadow)",
            }}
          >
            Guardar día
          </button>
        </div>
      )}
    </dialog>
  );
}
