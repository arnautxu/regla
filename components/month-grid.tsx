"use client";

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
   cae con daltonismo. La forma sobrevive en escala de grises. */

function bandStyle(cell: DayCell): React.CSSProperties {
  const r = "999px";
  const radius = `${cell.bandStart ? r : "0"} ${cell.bandEnd ? r : "0"} ${
    cell.bandEnd ? r : "0"
  } ${cell.bandStart ? r : "0"}`;

  // Los días de otro mes no llevan banda. Atenuarla con opacidad
  // funcionaba en oscuro (se fundía con el fondo), pero sobre papel
  // blanco el rojo al 32% es rosa — y el rosa se lee como OTRO
  // estado, no como "esto es del mes pasado". El número gris ya dice
  // de sobra que ese día no es de aquí.
  if (!cell.inMonth) return { display: "none" };

  const base: React.CSSProperties = { borderRadius: radius };

  switch (cell.band) {
    case "regla":
      return { ...base, top: 4, bottom: 4, background: "var(--cal-regla)" };
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

function numberColor(cell: DayCell): string {
  if (!cell.inMonth) return "var(--fg-faint)";
  if (cell.band === "regla") return "var(--cal-regla-fg)";
  return cell.isFuture ? "var(--fg-muted)" : "var(--fg)";
}

export function MonthGrid({
  weeks,
  onSelect,
}: {
  weeks: DayCell[][];
  onSelect: (cell: DayCell) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className="pb-2 text-center text-2xs font-semibold uppercase tracking-[0.1em] text-faint"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {weeks.map((week) => (
          <div key={week[0].key} className="grid grid-cols-7">
            {week.map((cell) => (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  haptic(8);
                  onSelect(cell);
                }}
                aria-label={`${cell.dayNumber}${BAND_ALT[cell.band ?? "none"]}${
                  cell.pillSkipped ? ", sin pastilla" : ""
                }`}
                aria-current={cell.isToday ? "date" : undefined}
                className="relative flex h-11 items-center justify-center"
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

                <span
                  className="tnum relative text-sm"
                  style={{
                    color: numberColor(cell),
                    // Los días de otro mes no engordan aunque tengan
                    // banda calculada: ya no la pintamos.
                    fontWeight: !cell.inMonth
                      ? 400
                      : cell.isToday
                        ? 700
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const BAND_ALT: Record<NonNullable<Band> | "none", string> = {
  regla: ", con regla",
  prevista: ", regla prevista",
  fertil: ", ventana fértil",
  none: "",
};

export function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-lg gap-y-2 text-xs text-muted">
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-3 w-6 rounded-full"
          style={{ background: "var(--cal-regla)" }}
        />
        Regla
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-3 w-6 rounded-full"
          style={{ border: "1.5px dashed var(--cal-prevista)" }}
        />
        Prevista
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-[3px] w-6 rounded-full"
          style={{ background: "var(--cal-fertil)" }}
        />
        Fértil
      </li>
    </ul>
  );
}
