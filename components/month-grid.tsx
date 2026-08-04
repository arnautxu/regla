"use client";

import { useRef } from "react";
import { WEEKDAY_LABELS, type Band, type DayCell } from "@/lib/calendar";
import { haptic } from "@/lib/use-lilaila";

/* La banda se dibuja como una capa a sangre dentro de la celda y solo
   se redondean las puntas de la racha. Así cinco días de regla se
   leen como una barra de cinco días y no como cinco pastillas.

   Las tres bandas se distinguen por FORMA, no solo por color:

     regla    → píldora sólida a toda altura
     prevista → píldora de contorno discontinuo
     fértil   → barra fina bajo el número

   Si las tres fueran píldoras del mismo alto, distinguirlas
   dependería únicamente del tono — y eso es exactamente lo que se
   cae con daltonismo. La forma sobrevive en escala de grises.

   Dentro de la regla, la INTENSIDAD dice cuánto. Los cinco niveles
   de flujo llevaban desde el principio en la base de datos y aquí se
   pintaban todos del mismo rojo, así que el calendario sabía cuándo
   pero no cuánto — que es media pregunta sin contestar. La rampa y
   sus colores de número viven en globals.css. */

function flowTone(cell: DayCell): { bg: string; fg: string } {
  // Sin nivel apuntado (marcado por el botón, que no pregunta cuánto)
  // se usa el tono de siempre. No se inventa un nivel medio: eso sería
  // meter un dato que ella no ha dado.
  const n = cell.flow && cell.flow > 0 ? cell.flow : null;
  return n
    ? { bg: `var(--cal-flow-${n})`, fg: `var(--cal-flow-${n}-fg)` }
    : { bg: "var(--cal-regla)", fg: "var(--cal-regla-fg)" };
}

function bandStyle(cell: DayCell): React.CSSProperties {
  const r = "999px";
  const radius = `${cell.bandStart ? r : "0"} ${cell.bandEnd ? r : "0"} ${
    cell.bandEnd ? r : "0"
  } ${cell.bandStart ? r : "0"}`;

  const base: React.CSSProperties = { borderRadius: radius };

  switch (cell.band) {
    case "regla":
      return { ...base, top: 4, bottom: 4, background: flowTone(cell).bg };
    case "fertil":
      // Subrayado fino. Es el cálculo menos fiable de la app, así que
      // es también lo más callado: no compite con el número y deja el
      // día legible con el color de texto normal.
      return { ...base, bottom: 4, height: 3, background: "var(--cal-fertil)" };
    case "prevista":
      // Contorno discontinuo. Un relleno sólido diría "esto ha
      // pasado", y no ha pasado: es una estimación.
      return {
        ...base,
        top: 4,
        bottom: 4,
        border: "1px dashed var(--cal-prevista)",
        borderLeftStyle: cell.bandStart ? "dashed" : "none",
        borderRightStyle: cell.bandEnd ? "dashed" : "none",
      };
    default:
      return { display: "none" };
  }
}

/* Los días de otro mes SÍ llevan banda.

   Antes no, y se llevaba por delante justo el dato que se venía a
   buscar: la ventana de la próxima regla cae casi siempre en la fila
   de arrastre, así que en agosto no se pintaba nada mientras el
   bloque de debajo anunciaba que empezaba "entre el 29 y el 4". El
   lector de pantalla sí la anunciaba, o sea que lo que se oía y lo
   que se veía tampoco coincidían.

   Se intentó antes con opacidad y salió mal: sobre papel blanco el
   rojo al 32% es rosa, y el rosa se lee como OTRO estado. La salida
   es la tercera — banda a plena tinta y número en gris. La racha
   sigue siendo continua, que es lo que hay que entender, y el gris ya
   dice de sobra que ese día no es de aquí. */
function numberColor(cell: DayCell): string {
  if (cell.band === "regla") return flowTone(cell).fg;
  // El día más probable manda sobre el gris de "otro mes". Cae en la
  // fila de arrastre casi siempre —la regla siguiente rara vez empieza
  // en el mes que estás mirando—, así que dejar ganar al gris lo
  // borraba justo cuando importa, y el bloque de abajo lo anunciaba
  // igualmente: otra vez lo dicho y lo pintado sin coincidir.
  if (cell.mostLikely) return "var(--cal-prevista)";
  if (!cell.inMonth) return "var(--fg-faint)";
  return cell.isFuture ? "var(--fg-muted)" : "var(--fg)";
}

function DayButton({
  cell,
  onSelect,
  tabIndex,
}: {
  cell: DayCell;
  onSelect: (cell: DayCell) => void;
  tabIndex: number;
}) {
  return (
    <button
      type="button"
      role="gridcell"
      data-key={cell.key}
      tabIndex={tabIndex}
      onClick={() => {
        haptic(8);
        onSelect(cell);
      }}
      aria-label={ariaLabel(cell)}
      aria-current={cell.isToday ? "date" : undefined}
      className="relative flex h-12 items-center justify-center outline-none focus-visible:z-10"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0"
        style={bandStyle(cell)}
      />

      {/* Hoy: un aro por encima de la banda. Es la única
          marca que tiene que ganar siempre. */}
      {cell.isToday && (
        <span
          aria-hidden="true"
          className="absolute size-8 rounded-full"
          style={{ boxShadow: "inset 0 0 0 2px var(--fg)" }}
        />
      )}

      {/* El aro de foco va por fuera del número y por encima de la
          banda: dibujado sobre la banda, en un día de "Diluvio" se
          perdía dentro del granate. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0.5 inset-y-0 rounded-lg opacity-0 [button:focus-visible>&]:opacity-100"
        style={{ boxShadow: "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)" }}
      />

      <span
        className="tnum relative text-[15px]"
        style={{
          color: numberColor(cell),
          fontWeight:
            cell.isToday || cell.mostLikely
              ? 700
              : !cell.inMonth
                ? 400
                : cell.band
                  ? 600
                  : 400,
        }}
      >
        {cell.dayNumber}
      </span>

      {/* Marca de registro propio: distinta de la banda,
          que es cálculo nuestro. Esto lo escribió ella. */}
      {cell.logged && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1 size-1 rounded-full"
          style={{ background: numberColor(cell), opacity: 0.75 }}
        />
      )}

      {/* Pastilla olvidada: anillo hueco abajo a la
          izquierda. Hueco y no relleno a propósito — es la
          forma de "falta algo", y se distingue del punto de
          registro en escala de grises, no solo por sitio. */}
      {cell.inMonth && cell.pillSkipped && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1.5 size-[5px] rounded-full"
          style={{ boxShadow: `inset 0 0 0 1.5px ${numberColor(cell)}` }}
        />
      )}
    </button>
  );
}

/* ── Teclado y lector de pantalla ────────────────────────────────
   Esto era una manta de cuarenta y dos botones sueltos: con VoiceOver
   sonaba como una lista plana, sin decir que era una tabla de fechas
   ni en qué columna estaba cada día, y con teclado había que dar
   cuarenta y dos tabuladores para cruzarla.

   Ahora es el patrón de rejilla de fechas de siempre: role="grid"
   con filas y celdas, y UNA sola parada de tabulador (tabindex
   móvil) desde la que se navega con las flechas. Entras al
   calendario, te mueves con las flechas y sales con un tabulador —
   que es lo que hace cualquier selector de fecha decente. */
function WeekdayHeader() {
  return (
    <div role="row" className="grid grid-cols-7 pb-2">
      {WEEKDAY_LABELS.map((d, i) => (
        <div
          key={`${d}-${i}`}
          role="columnheader"
          aria-label={WEEKDAY_FULL[i]}
          className="text-center text-2xs font-semibold uppercase tracking-[0.1em] text-faint"
        >
          {d}
        </div>
      ))}
    </div>
  );
}

const WEEKDAY_FULL = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

/** Adónde lleva cada tecla, en días. */
const SALTO: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: 7,
  ArrowUp: -7,
};

export function MonthGrid({
  weeks,
  onSelect,
}: {
  weeks: DayCell[][];
  onSelect: (cell: DayCell) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cells = weeks.flat();

  /* La parada de tabulador: hoy si está en pantalla, y si no el
     primer día del mes. Nunca la primera celda a secas — esa suele
     ser del mes anterior, y entrar al calendario para aterrizar en
     "27 de julio" es aterrizar en el sitio equivocado. */
  const foco =
    cells.find((c) => c.isToday)?.key ??
    cells.find((c) => c.inMonth)?.key ??
    cells[0]?.key;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const paso = SALTO[e.key];
    const target = e.target as HTMLElement;
    const desde = target.dataset?.key;
    if ((!paso && e.key !== "Home" && e.key !== "End") || !desde) return;

    const i = cells.findIndex((c) => c.key === desde);
    if (i < 0) return;

    // Home y End van a los extremos de la SEMANA, no del mes: es lo
    // que hace un selector de fecha y lo que espera quien ya sabe
    // usar uno.
    const fila = Math.floor(i / 7) * 7;
    const destino =
      e.key === "Home" ? fila : e.key === "End" ? fila + 6 : i + paso;

    const siguiente = cells[destino];
    if (!siguiente) return;

    e.preventDefault();
    ref.current
      ?.querySelector<HTMLButtonElement>(`[data-key="${siguiente.key}"]`)
      ?.focus();
  }

  return (
    <div ref={ref} onKeyDown={onKeyDown}>
      <div role="grid" aria-label="Calendario del mes">
        <WeekdayHeader />

        <div role="rowgroup" className="flex flex-col gap-1">
          {weeks.map((week) => (
            <div role="row" key={week[0].key} className="grid grid-cols-7">
              {week.map((cell) => (
                <DayButton
                  key={cell.key}
                  cell={cell}
                  onSelect={onSelect}
                  tabIndex={cell.key === foco ? 0 : -1}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* El nivel de flujo se dice con palabras. La intensidad de la banda
   no existe para quien navega con lector de pantalla, y "4, con
   regla" se quedaba corto cuando la app sabe que fue un diluvio. */
const FLOW_ALT = ["", ", flujo poco", ", flujo normal", ", flujo mucho", ", flujo diluvio"];

const BAND_ALT: Record<NonNullable<Band> | "none", string> = {
  regla: ", con regla",
  prevista: ", puede empezar la regla",
  fertil: ", ventana fértil",
  none: "",
};

function ariaLabel(cell: DayCell): string {
  const flow =
    cell.band === "regla" && cell.flow ? (FLOW_ALT[cell.flow] ?? "") : "";
  return [
    String(cell.dayNumber),
    BAND_ALT[cell.band ?? "none"],
    flow,
    cell.mostLikely ? ", el día más probable" : "",
    cell.pillSkipped ? ", sin pastilla" : "",
  ].join("");
}

/* La leyenda suelta ya no existe: cada fila del bloque de resumen
   lleva su propia forma al lado de la etiqueta y las fechas, así que
   se aprende leyendo lo que se venía a consultar en vez de teniendo
   que mirar a otro sitio y acordarse del código. Ver MonthSummary en
   app/calendario/page.tsx. */
export function BandSwatch({ band }: { band: NonNullable<Band> }) {
  const common = "block shrink-0";
  if (band === "regla") {
    return (
      <span
        aria-hidden="true"
        className={`${common} h-3 w-6 rounded-full`}
        style={{ background: "var(--cal-regla)" }}
      />
    );
  }
  if (band === "prevista") {
    return (
      <span
        aria-hidden="true"
        className={`${common} h-3 w-6 rounded-full`}
        style={{ border: "1.5px dashed var(--cal-prevista)" }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${common} h-[3px] w-6 rounded-full`}
      style={{ background: "var(--cal-fertil)" }}
    />
  );
}
