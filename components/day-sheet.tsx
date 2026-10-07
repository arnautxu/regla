"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  db,
  fromKey,
  pillStreak,
  removeCryEvent,
  setPill,
  setSex,
  toKey,
  upsertDay,
} from "@/lib/db";
import { summarize } from "@/lib/day-summary";
import { ANIMOS, CRY_INTENSITIES, CRY_REASONS, SINTOMAS, labelOf } from "@/lib/labels";
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
  day: base,
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
  const panel = useRef<HTMLDivElement>(null);
  const { settings, cycles, dateKey: hoyKey } = useLilaila();
  const empezoRegla = useRef(false);

  // <dialog> nativo: da trampa de foco, Escape y scroll bloqueado sin
  // escribirlos a mano, y todos suelen salir mal escritos a mano.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (base && !el.open) {
      el.showModal();
      // Si no, el navegador enfoca el primer botón (la flecha ‹) y en
      // iPhone se queda con el aro rojo de foco nada más abrir.
      panel.current?.focus({ preventScroll: true });
    }
    if (!base && el.open) el.close();
  }, [base]);

  // Se ajusta DURANTE el render y no en un efecto: es el patrón que
  // documenta React para "resetear estado cuando cambia una prop", y
  // el efecto además repintaba una vez de más — se veía el detalle
  // del día anterior abierto durante un fotograma al saltar de día.
  const [cryError, setCryError] = useState("");
  // Las flechas ‹ › mueven la hoja por días sin volver al calendario.
  // El desplazamiento vuelve a 0 cada vez que se abre en otro día.
  const [offset, setOffset] = useState(0);
  const [ultimaClave, setUltimaClave] = useState(base?.key);
  if (base?.key !== ultimaClave) {
    setUltimaClave(base?.key);
    setOffset(0);
    setCryError("");
  }

  const day: SheetDay | null = useMemo(() => {
    if (!base) return null;
    if (offset === 0) return base;
    const key = vecino(base.key, offset);
    return { key, date: fromKey(key), isToday: key === hoyKey, isFuture: key > hoyKey };
  }, [base, offset, hoyKey]);

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
        // Al volver a abrirla, siempre en el día que se tocó, no en el
        // último al que se llegó con las flechas.
        setOffset(0);
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
        <div ref={panel} tabIndex={-1} className="sheet-panel flex flex-col outline-none">
          {/* Cabecera, cuerpo y pie como tres piezas: solo el cuerpo se
              desplaza, si hace falta. Antes la hoja entera era el
              contenedor con scroll y el pie "pegado" con sticky; en
              iPhone el pie se quedaba a media hoja y la Nota asomaba
              por debajo de él. */}
          <div className="flex shrink-0 flex-col gap-xs px-lg pt-sm">
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-10 rounded-full"
            style={{ background: "var(--border-strong)" }}
          />

          <header className="flex items-start justify-between gap-md">
            <div>
              <h2 className="font-display text-lg font-bold tracking-[-0.02em]">
                {/* date-fns da los días en minúscula en es; en un título
                    eso se lee como una errata. */}
                {day.isToday
                  ? `Hoy, ${format(day.date, "EEEE d", { locale: es })}`
                  : capitalize(format(day.date, "EEEE d 'de' MMMM", { locale: es }))}
              </h2>
              <p className="text-xs text-faint">{resumen.estado}</p>
            </div>
            <div className="-mr-2 flex shrink-0">
              {[
                { delta: -1, label: "Día anterior", d: "M14.5 5 L8 12 L14.5 19", off: false },
                { delta: 1, label: "Día siguiente", d: "M9.5 5 L16 12 L9.5 19", off: day.key >= hoyKey },
              ].map((b) => (
                <button
                  key={b.delta}
                  type="button"
                  aria-label={b.label}
                  disabled={b.off}
                  onClick={() => {
                    haptic(6);
                    setOffset((o) => o + b.delta);
                  }}
                  className="flex size-10 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-25"
                  style={{ color: "var(--fg-muted)" }}
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={b.d} />
                  </svg>
                </button>
              ))}
            </div>
          </header>
          </div>

          <div data-sheet-body className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto overscroll-contain px-lg pt-2xs pb-md">
          {day.isFuture ? (
            <p className="text-sm leading-relaxed text-muted">
              Este día todavía no ha pasado. Cuando llegue me cuentas.
            </p>
          ) : (
            <>
              {/* Todo a la vista y en el orden en que se piensa: cuánto
                  sangras, cómo va el día, qué duele, cómo estás. Antes
                  la mitad vivía detrás de "Añadir o cambiar detalles" y
                  un resumen en frases repetía lo que ya dicen los
                  botones encendidos. */}

              {!!log?.cryEvents?.length && (
                <section aria-label="Episodios PAS" className="flex flex-col gap-2">
                  {log.cryEvents.map((event) => (
                    <div key={event.id} className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">
                          💧 {labelOf(CRY_REASONS, event.reason) ?? "PAS"}
                          <span className="ml-2 font-normal text-faint">
                            {new Date(event.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </p>
                        <button
                          type="button"
                          className="shrink-0 text-xs underline underline-offset-2"
                          style={{ color: "var(--fg-muted)" }}
                          aria-label="Eliminar este episodio PAS"
                          onClick={() => {
                            if (!window.confirm("¿Eliminar este episodio PAS?")) return;
                            haptic(8);
                            setCryError("");
                            void removeCryEvent(day.key, event.id).catch(() =>
                              setCryError("No se ha podido eliminar este PAS."),
                            );
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                      {event.intensity && (
                        <p className="mt-1 text-xs text-muted">
                          Intensidad: {CRY_INTENSITIES.find((option) => option.value === event.intensity)?.label.toLowerCase()}
                        </p>
                      )}
                      {event.note && <p className="mt-1 whitespace-pre-wrap text-muted">{event.note}</p>}
                    </div>
                  ))}
                  {cryError && <p className="text-xs" style={{ color: "var(--accent)" }} role="alert">{cryError}</p>}
                </section>
              )}

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

            </>
          )}

          {!day.isFuture && (
            <>
              <MoodRow
                value={log ?? undefined}
                onChange={(patch) => void upsertDay(day.key, patch)}
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
                label="Ánimo"
                options={ANIMOS}
                selected={log?.mood ?? []}
                onToggle={(v) =>
                  void upsertDay(day.key, { mood: toggle(log?.mood, v) })
                }
              />

              {/* Lo de cada día, uno al lado del otro: dos preguntas de
                  sí o no no merecen dos filas a lo ancho. */}
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: settings.pill.enabled ? "1fr 1fr" : "1fr" }}
              >
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
                  only="answer"
                  log={log ?? undefined}
                  onSet={(v) => void setSex(day.key, v)}
                  onPatch={(patch) => void upsertDay(day.key, patch)}
                  dateKey={day.key}
                />
              </div>
              <SexRow
                only="detail"
                log={log ?? undefined}
                onSet={(v) => void setSex(day.key, v)}
                onPatch={(patch) => void upsertDay(day.key, patch)}
                dateKey={day.key}
              />

              <section>
                <label
                  htmlFor={`nota-${day.key}`}
                  className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
                >
                  Nota
                </label>
                <textarea
                  key={day.key}
                  id={`nota-${day.key}`}
                  defaultValue={log?.note ?? ""}
                  onBlur={(e) =>
                    void upsertDay(day.key, {
                      note: e.target.value.trim() || undefined,
                    })
                  }
                  rows={1}
                  placeholder="Lo que quieras acordarte"
                  className="mt-1.5 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none field-sizing-content"
                  style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--border)" }}
                />
              </section>

            </>
          )}
          </div>

          {/* Cada toque escribe al momento, y ahora la hoja lo dice
              junto al botón: antes "Guardar día" sugería que sin
              pulsarlo se perdía lo marcado. La nota es lo único que
              escribe al perder el foco, y el blur ocurre antes que el
              click, así que llega. Pegado abajo para que "Listo" esté
              siempre a mano aunque la hoja sea larga. */}
          <div
            className="flex shrink-0 items-center gap-md border-t border-line px-lg pt-sm"
            style={{ paddingBottom: "calc(var(--spacing-sm) + env(safe-area-inset-bottom))" }}
          >
            <p className="flex-1 text-xs font-semibold" style={{ color: "var(--ok)" }}>
              {day.isFuture ? "" : "✓ Se guarda al momento"}
            </p>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="min-h-[46px] rounded-full px-xl font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
              style={{
                background: "var(--accent)",
                color: "var(--on-accent)",
                boxShadow: "3px 3px 0 0 var(--depth-shadow)",
              }}
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
