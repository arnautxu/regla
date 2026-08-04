import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  fromKey,
  toKey,
  todayKey,
  type Cycle,
  type DayLog,
  type FlowLevel,
  type Settings,
} from "./db";
import { buildModel } from "./predict";
import { dayRange } from "./format";

/* ═══════════════════════════════════════════════════════════════
   Construcción del mes.

   La unidad visual no es el día suelto: es la RACHA. Una regla son
   cinco días seguidos y una ventana fértil son seis. Pintarlas como
   puntos independientes pierde justo la información que importa —
   cuánto dura y dónde empieza. Por eso cada celda sabe si es
   principio o final de su racha, y el fondo se dibuja continuo.

   Dos reglas que esta pantalla incumplía y ahora sostiene:

   1. UNA SOLA PREDICCIÓN. Esto se calculaba su propia media de los
      últimos seis ciclos mientras la pantalla Hoy usaba buildModel
      (mediana, descarte de atípicos, pesos que decaen). Dos motores,
      dos respuestas: la rejilla pintaba cinco días a partir del 1 de
      septiembre y la tarjeta de debajo decía "entre el 29 y el 4".
      Ahora las dos salen de buildModel y no pueden discrepar.

   2. SE PINTA EL MARGEN, NO EL PUNTO. Antes se pintaba un bloque
      sólido de cinco días en la fecha estimada: la forma de un hecho
      para una conjetura. Ahora se pinta la VENTANA en la que puede
      empezar —que es lo que la app sabe— y dentro de ella se marca
      el día con más papeletas. Ya no se pinta la duración prevista:
      no se sabe, y fingirlo era la mitad del problema.
   ═══════════════════════════════════════════════════════════════ */

/** Qué se pinta detrás del número. Excluyentes: solo gana una. */
export type Band = "regla" | "prevista" | "fertil" | null;

export interface DayCell {
  key: string;
  date: Date;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  band: Band;
  /** Extremos de la racha, para redondear solo las puntas */
  bandStart: boolean;
  bandEnd: boolean;
  flow?: FlowLevel;
  /** Dentro de la ventana prevista, el día con más papeletas */
  mostLikely: boolean;
  /** Hay algo registrado ese día (ánimo, dolor, nota…) */
  logged: boolean;
  /**
   * Ese día contestó que NO se tomó la pastilla.
   *
   * Se marca el olvido y no la toma. Una anticonceptiva se toma todos
   * los días, así que pintar los días tomados llenaría el mes de
   * puntos que no dicen nada; lo que se busca de un vistazo es el
   * hueco. Un día sin contestar no es un olvido y no se pinta: eso
   * sería acusarla de algo que no ha dicho.
   */
  pillSkipped: boolean;
}

const WEEK_OPTS = { weekStartsOn: 1 } as const; // lunes, que esto es España

export const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function addRange(set: Set<string>, from: Date, days: number) {
  for (let i = 0; i < days; i++) set.add(toKey(addDays(from, i)));
}

/**
 * Una fila del bloque de resumen: la forma, qué es y cuándo.
 *
 * Sustituye a la leyenda suelta que había debajo. Una leyenda aparte
 * obliga a mirar dos sitios y a acordarse del código de formas; si la
 * misma fila lleva la forma Y las fechas, se aprende leyéndola y de
 * paso contesta la pregunta por la que se abre el calendario.
 */
export interface SummaryRow {
  band: NonNullable<Band>;
  label: string;
  detail: string;
}

export interface MonthData {
  weeks: DayCell[][];
  /** Cuántos días del mes tienen algo pintado — para el estado vacío */
  painted: number;
  /** Lo que se ve en pantalla, dicho con palabras y fechas */
  summary: SummaryRow[];
}

/**
 * Qué se pinta y dónde, sin decidir todavía en qué rejilla.
 *
 * Sigue separado de buildMonth aunque ahora solo haya una vista: es
 * la frontera entre "qué sabe la app de estos días" y "cómo se
 * coloca en una cuadrícula", y tenerla escrita es lo que hizo que
 * probar una segunda disposición costara una tarde y no una copia
 * del cálculo — que es como se llega a dos predicciones que no
 * coinciden.
 */
function paint(cycles: Cycle[], days: DayLog[], settings: Settings, today: string) {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  // El MISMO modelo que usa la pantalla Hoy. Ver la nota 1 de arriba.
  const model = buildModel(sorted, settings);
  const avgLength = model.length;
  const spread = model.spread;

  // El sangrado se pinta desde los DIAS, no desde el rango del ciclo.
  // Derivando el ciclo de una racha con huecos permitidos, rellenar
  // start..end pintaba de rojo un dia que ella habia dejado sin
  // marcar: justo la contradiccion que el modelo por dias elimina.
  const bleeding = new Set<string>(
    days.filter((d) => d.flow !== undefined && d.flow > 0).map((d) => d.date),
  );
  const fertile = new Set<string>();
  const predicted = new Set<string>();
  let mostLikelyKey: string | undefined;

  /** Ventana fértil del ciclo que empieza en `start` y dura `length`. */
  const addFertile = (start: Date, length: number) => {
    if (length < 15 || length > 60) return;
    // Ojo con el off-by-one: `ovulation` es un DÍA del ciclo (el 1 es
    // el primer día de regla), y addDays cuenta OFFSETS desde el
    // inicio. El día N está en el offset N-1.
    const ovulation = length - 14;
    addRange(fertile, addDays(start, ovulation - 1 - 4), 6);
  };

  sorted.forEach((cycle, i) => {
    const start = fromKey(cycle.startDate);
    const next = sorted[i + 1];
    // La fase lútea dura ~14 días y es la constante; la folicular es
    // la que varía. Así que la ovulación se ancla al final del ciclo,
    // usando su longitud real cuando se conoce.
    addFertile(
      start,
      next
        ? differenceInCalendarDays(fromKey(next.startDate), start)
        : avgLength,
    );
  });

  // --- Lo que viene: tres ciclos hacia delante y para de contar.
  const last = sorted[sorted.length - 1];
  const hoy = fromKey(today);
  if (last) {
    for (let k = 1; k <= 3; k++) {
      const start = addDays(fromKey(last.startDate), avgLength * k);
      const latest = addDays(start, spread);
      // Ventana ya pasada: si no bajó, eso es un retraso y lo cuenta
      // la pantalla Hoy. Pintarla aquí serían días marcados como
      // "puede empezar" que ya se sabe que no empezaron.
      if (differenceInCalendarDays(latest, hoy) < 0) continue;

      // Recortada por hoy: la mitad de atrás de la ventana ya no
      // puede ocurrir, y dejarla pintada la haría parecer un error.
      const earliest = addDays(start, -spread);
      const desde =
        differenceInCalendarDays(earliest, hoy) < 0 ? hoy : earliest;
      addRange(predicted, desde, differenceInCalendarDays(latest, desde) + 1);

      // Solo la primera lleva "lo más probable". Marcar también la de
      // dentro de tres meses sería fingir una puntería que no hay.
      if (k === 1) mostLikelyKey = toKey(start);

      // Y su ventana fértil, que antes no se calculaba para ciclos
      // futuros: al pasar de mes, la tarjeta seguía anunciando una
      // ventana fértil que la rejilla no pintaba por ninguna parte.
      addFertile(start, avgLength);
    }
  }

  const logs = new Map(days.map((d) => [d.date, d]));

  // La regla registrada gana a la prevista, y ambas a la fértil: si
  // ya sabemos que sangró, la estimación sobra.
  const bandOf = (key: string): Band =>
    bleeding.has(key)
      ? "regla"
      : predicted.has(key)
        ? "prevista"
        : fertile.has(key)
          ? "fertil"
          : null;

  /**
   * Las celdas de un rango cualquiera, en semanas de lunes a domingo.
   *
   * `focusMonth` solo lo usa la vista de mes, para saber qué días son
   * de arrastre. La tira continua no tiene "fuera de mes": ahí todos
   * los días son igual de suyos, que es justamente su gracia.
   */
  const cellsBetween = (from: Date, to: Date, focusMonth?: Date): DayCell[][] => {
    const all = eachDayOfInterval({
      start: startOfWeek(from, WEEK_OPTS),
      end: endOfWeek(to, WEEK_OPTS),
    });

    const cells: DayCell[] = all.map((date) => {
      const key = toKey(date);
      const log = logs.get(key);
      const band = bandOf(key);
      const prev = bandOf(toKey(addDays(date, -1)));
      const next = bandOf(toKey(addDays(date, 1)));

      return {
        key,
        date,
        dayNumber: date.getDate(),
        inMonth: focusMonth ? isSameMonth(date, focusMonth) : true,
        isToday: key === today,
        isFuture: key > today,
        band,
        bandStart: band !== null && prev !== band,
        bandEnd: band !== null && next !== band,
        flow: log?.flow,
        mostLikely: band === "prevista" && key === mostLikelyKey,
        logged:
          log !== undefined &&
          (log.painLevel !== undefined ||
            log.flow !== undefined ||
            !!log.note ||
            !!log.mood?.length ||
            !!log.symptoms?.length ||
            log.sex === true),
        pillSkipped: log?.pill === false,
      };
    });

    const weeks: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // Una racha que cruza de semana se rompe igualmente al saltar de
    // fila, así que también se redondea contra los bordes de la fila.
    // Sin esto la banda queda cortada a hueso contra el margen y parece
    // un fallo de render en vez de una continuación.
    for (const week of weeks) {
      week.forEach((cell, i) => {
        if (!cell.band) return;
        if (i === 0) cell.bandStart = true;
        if (i === 6) cell.bandEnd = true;
      });
    }

    return weeks;
  };

  return { cellsBetween, mostLikelyKey, firstCycleStart: sorted[0]?.startDate };
}

export function buildMonth(
  monthDate: Date,
  cycles: Cycle[],
  days: DayLog[],
  settings: Settings,
  today = todayKey(),
): MonthData {
  const { cellsBetween, mostLikelyKey } = paint(cycles, days, settings, today);
  const weeks = cellsBetween(
    startOfMonth(monthDate),
    endOfMonth(monthDate),
    monthDate,
  );
  const cells = weeks.flat();

  return {
    weeks,
    painted: cells.filter((c) => c.inMonth && c.band !== null).length,
    // Del MISMO array de celdas que se acaba de pintar. Es lo que
    // impide que el bloque de abajo y la rejilla vuelvan a contar
    // historias distintas: no hay dos cálculos que sincronizar.
    summary: summarize(cells, mostLikelyKey),
  };
}

/* --- Resumen ----------------------------------------------------- */

const LABEL: Record<NonNullable<Band>, string> = {
  regla: "Regla",
  prevista: "Puede empezar",
  fertil: "Ventana fértil",
};

/** Tramos seguidos de una misma banda, en el orden en que se ven. */
function runsOf(cells: DayCell[], band: Band): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  let open: { start: Date; end: Date } | null = null;

  for (const cell of cells) {
    if (cell.band === band) {
      if (open) open.end = cell.date;
      else open = { start: cell.date, end: cell.date };
    } else if (open) {
      out.push(open);
      open = null;
    }
  }
  if (open) out.push(open);
  return out;
}

function summarize(
  cells: DayCell[],
  mostLikelyKey: string | undefined,
): SummaryRow[] {
  const rows: SummaryRow[] = [];

  const marcado = mostLikelyKey
    ? cells.find((c) => c.key === mostLikelyKey)
    : undefined;

  for (const band of ["regla", "prevista", "fertil"] as const) {
    const runs = runsOf(cells, band);
    if (!runs.length) continue;

    const detail = runs
      .map((r) => {
        const texto = dayRange(r.start, r.end);
        // El día con más papeletas, dicho con palabras: la rejilla lo
        // marca en rojo y en negrita, pero un número resaltado dentro
        // de una banda punteada no se explica solo.
        //
        // Va DENTRO del paréntesis de su tramo y no al final de la
        // fila. Cuando en un mes caben dos ventanas —pasa siempre que
        // el ciclo es corto—, colgarlo al final lo dejaba pegado a la
        // segunda, que es justo la que no tiene día probable.
        const suyo =
          band === "prevista" &&
          marcado &&
          marcado.date >= r.start &&
          marcado.date <= r.end;
        return suyo
          ? `${texto} (lo más probable, ${dayRange(marcado.date)})`
          : texto;
      })
      .join(" · ");

    rows.push({ band, label: LABEL[band], detail });
  }

  return rows;
}
