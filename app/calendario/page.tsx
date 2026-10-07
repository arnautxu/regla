"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addMonths,
  differenceInCalendarDays,
  format,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { motion, type PanInfo } from "motion/react";
import { Lilita } from "@/components/lilita";
import { DaySheet } from "@/components/day-sheet";
import { BandSwatch, MonthGrid } from "@/components/month-grid";
import { buildMonth, type DayCell, type SummaryRow } from "@/lib/calendar";
import { capitalize } from "@/lib/format";
import { db, fromKey, type Cycle } from "@/lib/db";
import { phaseByDay, PHASE_LABEL, type Phase } from "@/lib/cycle";
import { summarize as summarizeDay } from "@/lib/day-summary";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic, useLilaila } from "@/lib/use-lilaila";
import { signals } from "@/lib/signals";

/** Cuánto hay que arrastrar para que cuente como cambio de mes. */
const SWIPE = 56;

export default function Calendario() {
  const { ready, settings, cycles, dateKey, state } = useLilaila();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<DayCell | null>(null);
  // El día que se mira abajo, sin abrir nada. Tocar un día enseña qué
  // pasó; tocarlo otra vez (o "Editar") abre la hoja. Antes cada toque
  // tapaba el mes entero con un modal solo para leer una línea.
  const [preview, setPreview] = useState<DayCell | null>(null);
  // De dónde viene el mes nuevo: a la derecha si avanzas, a la
  // izquierda si retrocedes. Solo afecta a la entrada; la salida no
  // se anima (el mes viejo desaparece al cambiar la key, como en las
  // pestañas) para no pelear con que cada mes tiene una altura propia
  // (5 o 6 semanas) y solaparlas se notaría como un salto.
  const [direction, setDirection] = useState(1);

  function goToMonth(target: Date) {
    setDirection(target.getTime() >= month.getTime() ? 1 : -1);
    setMonth(target);
  }

  /* Deslizar para cambiar de mes.

     Se mira la VELOCIDAD además del recorrido: un gesto rápido y
     corto es tan intencionado como uno lento y largo, y exigir 56 px
     siempre hace que los flicks rápidos —que es como se pasa un
     calendario de verdad— no hagan nada y parezca que se ha
     encasquillado. */
  function onSwipe(_: unknown, info: PanInfo) {
    const fuerte = Math.abs(info.velocity.x) > 380;
    const lejos = Math.abs(info.offset.x) > SWIPE;
    if (!fuerte && !lejos) return;
    haptic(8);
    goToMonth(addMonths(month, info.offset.x < 0 ? 1 : -1));
  }

  const days = useLiveQuery(() => db.days.toArray(), [], []);

  const { weeks, painted, summary } = useMemo(
    () => buildMonth(month, cycles, days ?? [], settings, dateKey),
    [month, cycles, days, settings, dateKey],
  );

  const phases = useMemo(
    () =>
      phaseMap(
        weeks.flat().map((c) => c.key),
        cycles,
        state.avgLength,
        state.model.periodLength,
      ),
    [weeks, cycles, state.avgLength, state.model.periodLength],
  );

  /* Ver solo los días con una cosa: migraña, PAS, sexo, una
     etiqueta suya. Solo salen las que alguna vez ha apuntado: un
     filtro que no puede encontrar nada es un botón de adorno. */
  const [filtro, setFiltro] = useState<string | null>(null);
  const opciones = useMemo(
    () => signals(settings.customTags).filter((sg) => (days ?? []).some(sg.match)),
    [settings.customTags, days],
  );
  const activo = opciones.find((o) => o.id === filtro) ?? null;
  const highlight = useMemo(() => {
    if (!activo) return null;
    return new Set((days ?? []).filter(activo.match).map((d) => d.date));
  }, [activo, days]);
  const enEsteMes = highlight
    ? weeks.flat().filter((c) => c.inMonth && highlight.has(c.key)).length
    : 0;

  const previewLog = useMemo(
    () => (preview ? days?.find((d) => d.date === preview.key) : undefined),
    [preview, days],
  );

  function pick(cell: DayCell) {
    if (preview?.key === cell.key) {
      setSelected(cell);
      return;
    }
    setPreview(cell);
  }

  const isCurrentMonth = isSameMonth(month, new Date());
  const hoyAño = new Date().getFullYear();

  return (
    <div className="flex flex-1 flex-col gap-lg px-safe pt-safe pb-lg">
      {/* ── Cabecera con navegación de mes ─────────────────────── */}
      <header className="flex items-center justify-between gap-md pt-lg">
        <div className="flex min-w-0 items-center gap-2">
          <Lilita mood="neutral" size={38} className="shrink-0" />
          {/* El año solo cuando NO es el de hoy. Repetir "2026" en
              cada mes es ruido, y con el botón de Hoy en la cabecera
              "Agosto 2026" ya no cabía y se cortaba en "Agosto 20…",
              que es peor que no poner el año. */}
          <h1 className="truncate font-display text-xl font-bold capitalize tracking-[-0.03em]">
            {format(month, month.getFullYear() === hoyAño ? "LLLL" : "LLLL yyyy", {
              locale: es,
            })}
          </h1>
        </div>

        {/* Las flechas siguen, aunque ahora se pueda deslizar: el
            gesto no se ve, y una pantalla donde la única forma de
            navegar es un gesto invisible es una pantalla que hay que
            adivinar. Además el deslizamiento no existe con teclado. */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Volver a hoy vive AQUÍ, entre las flechas, y no en un
              enlace suelto bajo la rejilla: es navegación, y estaba
              en la otra punta de donde se navega. */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => {
                haptic(8);
                goToMonth(startOfMonth(new Date()));
              }}
              className="mr-1 flex h-11 items-center rounded-full px-3 text-xs font-semibold"
              style={{
                color: "var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              Hoy
            </button>
          )}
          <MonthButton
            label="Mes anterior"
            onClick={() => goToMonth(addMonths(month, -1))}
            d="M14.5 5 L8 12 L14.5 19"
          />
          <MonthButton
            label="Mes siguiente"
            onClick={() => goToMonth(addMonths(month, 1))}
            d="M9.5 5 L16 12 L9.5 19"
          />
        </div>
      </header>

      {ready && (
        <>
          {/* px-3 y no px-lg: con el relleno de tarjeta de siempre, las
              siete columnas se quedaban en 40 px y las bandas —que son
              lo que se viene a leer— salían canijas. Con 12 px cada
              día gana ancho sin que la punta de una racha en domingo
              acabe besando el borde redondeado de la tarjeta. */}
          <motion.div
            className="sticker overflow-hidden rounded-2xl px-3 py-md"
            style={{ background: "var(--surface)" }}
            // Deslizar de lado para cambiar de mes, que es como se pasa
            // un calendario. dragDirectionLock deja pasar el scroll
            // vertical: sin él, arrastrar hacia abajo sobre la rejilla
            // no movía la página y parecía que se había colgado.
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            dragMomentum={false}
            onDragEnd={onSwipe}
          >
            <motion.div
              key={month.toISOString()}
              initial={{ x: direction * 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{
                duration: DURATION.standard,
                ease: EASE_OUT_QUART,
              }}
            >
              <MonthGrid
                weeks={weeks}
                onSelect={pick}
                phases={phases}
                selectedKey={preview?.key}
                highlight={highlight}
              />
            </motion.div>
          </motion.div>

          {opciones.length > 0 && (
            <DayFilter
              opciones={opciones}
              activo={activo?.id ?? null}
              onPick={(id) => {
                haptic(6);
                setFiltro((f) => (f === id ? null : id));
              }}
              enEsteMes={enEsteMes}
            />
          )}

          {!activo && <PhaseLegend />}

          {preview && (
            <DayPreview
              cell={preview}
              phase={phases.get(preview.key)}
              lines={summarizeDay(previewLog, preview.key, cycles)}
              onEdit={() => setSelected(preview)}
              onClose={() => setPreview(null)}
            />
          )}

          <MonthSummary
            title={capitalize(format(month, "LLLL", { locale: es }))}
            rows={summary}
          />

          {/* El aviso solo cuando hay algo estimado en pantalla. Antes
              salía siempre, así que en un mes sin nada pintado se
              quedaba explicando unas bandas discontinuas que no
              estaban por ninguna parte. */}
          {summary.some((r) => r.band !== "regla") && (
            <p className="text-xs leading-relaxed text-faint">
              Lo punteado es una estimación a partir de tus últimos ciclos, no
              una promesa. La ventana fértil no sirve como anticonceptivo.
            </p>
          )}

          {/* Un mes en blanco tiene que decir que está en blanco. Sin
              esto no se distingue de que la app haya fallado al
              cargar, que es la lectura por defecto de una pantalla
              vacía. */}
          {summary.length === 0 && cycles.length > 0 && (
            <p className="text-sm text-muted">
              En {format(month, "LLLL", { locale: es })} no hay nada apuntado ni
              previsto.
            </p>
          )}

          {painted === 0 && cycles.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-md pb-xl">
              <Lilita mood="neutral" size={112} />
              <p className="max-w-[28ch] text-center text-sm leading-snug text-muted">
                Este mes está en blanco. Toca cualquier día y dime que fue el
                primero, y empiezo a pintar.
              </p>
            </div>
          )}
        </>
      )}

      <DaySheet day={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ── Fase de cada día ────────────────────────────────────────────
   El ciclo que contiene ese día y en qué día de él cae. Los días
   después del último inicio siguen el ritmo medio hacia delante, así
   que el mes que viene también se pinta: es una estimación, y por eso
   va solo de fondo suave y nunca como banda. */
function phaseMap(
  keys: string[],
  cycles: Cycle[],
  avgLength: number,
  periodLength: number,
): Map<string, Phase> {
  const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const out = new Map<string, Phase>();
  if (!sorted.length) return out;
  for (const key of keys) {
    let i = sorted.length - 1;
    while (i >= 0 && sorted[i].startDate > key) i--;
    if (i < 0) continue;
    const cycle = sorted[i];
    const next = sorted[i + 1];
    let day = differenceInCalendarDays(fromKey(key), fromKey(cycle.startDate)) + 1;
    let length = next
      ? differenceInCalendarDays(fromKey(next.startDate), fromKey(cycle.startDate))
      : avgLength;
    if (!next && day > length) {
      day = ((day - 1) % avgLength) + 1;
      length = avgLength;
    }
    out.set(key, phaseByDay(day, length, periodLength));
  }
  return out;
}

/* Una fila de botones que se desliza de lado. Uno encendido como
   mucho: con dos a la vez ya no se sabe qué aro significa qué. */
function DayFilter({
  opciones,
  activo,
  onPick,
  enEsteMes,
}: {
  opciones: { id: string; label: string }[];
  activo: string | null;
  onPick: (id: string) => void;
  enEsteMes: number;
}) {
  return (
    <section aria-label="Ver solo los días con…" className="-mt-sm flex flex-col gap-1.5">
      <div className="-mx-lg flex gap-1.5 overflow-x-auto px-lg pb-1 [scrollbar-width:none]">
        {opciones.map((o) => {
          const on = o.id === activo;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.id)}
              className="min-h-[34px] shrink-0 rounded-full px-3 text-[13px] font-semibold"
              style={{
                background: on ? "var(--fg)" : "var(--surface)",
                color: on ? "var(--bg)" : "var(--fg-muted)",
                boxShadow: on ? undefined : "inset 0 0 0 1.5px var(--border-strong)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {activo && (
        <p className="text-xs text-muted" aria-live="polite">
          {enEsteMes === 0
            ? "Este mes, ningún día."
            : `Este mes, ${enEsteMes} ${enEsteMes === 1 ? "día" : "días"}.`}{" "}
          <button type="button" onClick={() => onPick(activo)} className="font-semibold underline underline-offset-2">
            Quitar filtro
          </button>
        </p>
      )}
    </section>
  );
}

function PhaseLegend() {
  const items: { phase: Phase; v: string }[] = [
    { phase: "menstrual", v: "menstrual" },
    { phase: "folicular", v: "folicular" },
    { phase: "ovulacion", v: "ovulacion" },
    { phase: "lutea", v: "lutea" },
  ];
  return (
    <ul className="-mt-sm flex flex-wrap gap-x-md gap-y-1 text-2xs text-muted" aria-label="Fases">
      {items.map(({ phase, v }) => (
        <li key={phase} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-[4px]"
            style={{ background: `var(--ph-${v}-bg)`, boxShadow: `inset 0 0 0 1.5px var(--ph-${v})` }}
          />
          {PHASE_LABEL[phase]}
        </li>
      ))}
    </ul>
  );
}

function DayPreview({
  cell,
  phase,
  lines,
  onEdit,
  onClose,
}: {
  cell: DayCell;
  phase?: Phase;
  lines: ReturnType<typeof summarizeDay>;
  onEdit: () => void;
  onClose: () => void;
}) {
  const vacio = !lines.lineas.length && !lines.nota;
  return (
    <section
      className="flat flex flex-col gap-2 rounded-2xl px-md py-md"
      style={{ background: "var(--surface)" }}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="font-display text-base font-bold tracking-[-0.015em]">
            {capitalize(format(cell.date, "EEEE d 'de' MMMM", { locale: es }))}
          </h2>
          <p className="text-xs text-faint">
            {[lines.estado, phase && !lines.estado ? `Fase ${PHASE_LABEL[phase].toLowerCase()}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-2 -mt-1 flex size-9 items-center justify-center rounded-full text-faint"
        >
          ✕
        </button>
      </div>
      {cell.isFuture ? (
        <p className="text-sm text-muted">Todavía no ha pasado.</p>
      ) : vacio ? (
        <p className="text-sm text-muted">Nada apuntado este día.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {lines.lineas.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {lines.nota && <li className="italic text-muted">“{lines.nota}”</li>}
        </ul>
      )}
      {!cell.isFuture && (
        <button
          type="button"
          onClick={() => {
            haptic(10);
            onEdit();
          }}
          className="mt-1 self-start rounded-full px-md py-2 text-sm font-bold"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {vacio ? "Apuntar este día" : "Editar este día"}
        </button>
      )}
    </section>
  );
}

/* ── Lo que se ve, dicho con palabras ────────────────────────────
   Esto era dos cosas separadas: una tarjeta de "lo que viene" y una
   leyenda de formas. La tarjeta hablaba SIEMPRE desde hoy, así que al
   pasar a septiembre seguía anunciando la ventana fértil de agosto
   como si describiera lo que estabas mirando. Y la leyenda obligaba a
   mirar a otro sitio y a memorizar un código de formas.

   Fundidas: cada fila lleva la forma, qué es y cuándo, y sale del
   mismo array de celdas que acaba de pintar la rejilla — así que
   dice exactamente lo que se ve, ni un día más. */
function MonthSummary({ title, rows }: { title: string; rows: SummaryRow[] }) {
  if (!rows.length) return null;

  return (
    <section
      className="flex flex-col gap-3 px-1"
      aria-label={`Resumen: ${title}`}
    >
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        {title}
      </h2>

      {/* Lista y no <dl>: la etiqueta ya se lee dentro de la propia
          frase ("Regla el 4 de agosto"), así que un <dt> aparte la
          repetía y un lector de pantalla la cantaba dos veces. */}
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.band} className="flex items-baseline gap-3 text-sm">
            {/* La muestra se alinea con la línea base del texto y no
                al centro del bloque: con dos líneas de fechas, un
                centrado la dejaba flotando a media altura sin tocar
                nada. */}
            <span className="flex w-6 shrink-0 translate-y-[-2px] justify-center">
              <BandSwatch band={row.band} />
            </span>
            {/* text-pretty y no text-balance: balancear por longitud
                dejaba "Ventana fértil del" solo en la primera línea.
                Aquí lo que hace falta es que no quede una palabra
                huérfana al final, no que las líneas midan igual. */}
            <p className="tnum text-pretty">
              <span className="font-semibold">{row.label}</span>{" "}
              <span className="text-muted">{row.detail}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MonthButton({
  label,
  onClick,
  d,
}: {
  label: string;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        haptic(8);
        onClick();
      }}
      className="flex size-11 items-center justify-center rounded-full transition-[transform,background-color] duration-150 active:scale-90"
      style={{ color: "var(--fg-muted)" }}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}
