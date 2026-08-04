"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addMonths, format, isSameMonth, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { motion, type PanInfo } from "motion/react";
import { Lilita } from "@/components/lilita";
import { DaySheet } from "@/components/day-sheet";
import { BandSwatch, MonthGrid } from "@/components/month-grid";
import { buildMonth, type DayCell, type SummaryRow } from "@/lib/calendar";
import { capitalize } from "@/lib/format";
import { db } from "@/lib/db";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic, useLilaila } from "@/lib/use-lilaila";

/** Cuánto hay que arrastrar para que cuente como cambio de mes. */
const SWIPE = 56;

export default function Calendario() {
  const { ready, settings, cycles, dateKey } = useLilaila();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<DayCell | null>(null);
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
              <MonthGrid weeks={weeks} onSelect={setSelected} />
            </motion.div>
          </motion.div>

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
      className="sticker-phase flex flex-col gap-3 rounded-2xl px-lg py-md"
      style={{ background: "var(--phase-bg)" }}
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
