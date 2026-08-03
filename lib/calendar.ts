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
import { cycleLengths } from "./cycle";

/* ═══════════════════════════════════════════════════════════════
   Construcción del mes.

   La unidad visual no es el día suelto: es la RACHA. Una regla son
   cinco días seguidos y una ventana fértil son seis. Pintarlas como
   puntos independientes pierde justo la información que importa —
   cuánto dura y dónde empieza. Por eso cada celda sabe si es
   principio o final de su racha, y el fondo se dibuja continuo.
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
  /** Hay algo registrado ese día (ánimo, dolor, nota…) */
  logged: boolean;
}

const WEEK_OPTS = { weekStartsOn: 1 } as const; // lunes, que esto es España

export const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function addRange(set: Set<string>, from: Date, days: number) {
  for (let i = 0; i < days; i++) set.add(toKey(addDays(from, i)));
}

export interface MonthData {
  weeks: DayCell[][];
  /** Cuántos días del mes tienen algo pintado — para el estado vacío */
  painted: number;
}

export interface Upcoming {
  periodStart?: Date;
  periodEnd?: Date;
  /** Margen de incertidumbre del inicio, que es lo que se enseña */
  startEarliest?: Date;
  startLatest?: Date;
  fertileStart?: Date;
  fertileEnd?: Date;
  /** La ventana fértil está corriendo ahora mismo */
  fertileNow: boolean;
}

/**
 * Lo siguiente que toca. Se calcula aparte del mes porque casi nunca
 * cae dentro del mes que se está mirando, y es justo lo que se quiere
 * saber al abrir el calendario.
 */
export function upcoming(
  cycles: Cycle[],
  settings: Settings,
  today = todayKey(),
): Upcoming {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const last = sorted[sorted.length - 1];
  if (!last) return { fertileNow: false };

  const lengths = cycleLengths(sorted).slice(-6);
  const avg = lengths.length
    ? Math.round(mean(lengths))
    : settings.avgCycleLength;

  const now = fromKey(today);
  const base = fromKey(last.startDate);

  // Avanza ciclos hasta dar con el primero que aún no ha terminado.
  let k = 0;
  let periodStart = addDays(base, avg);
  while (
    differenceInCalendarDays(
      addDays(periodStart, settings.avgPeriodLength - 1),
      now,
    ) < 0 &&
    k < 24
  ) {
    k++;
    periodStart = addDays(base, avg * (k + 1));
  }

  const ovulation = avg - 14;
  let fertileStart = addDays(base, ovulation - 1 - 4);
  let fertileEnd = addDays(fertileStart, 5);
  if (differenceInCalendarDays(fertileEnd, now) < 0) {
    // La de este ciclo ya pasó: la siguiente cuelga de la regla prevista.
    fertileStart = addDays(periodStart, ovulation - 1 - 4);
    fertileEnd = addDays(fertileStart, 5);
  }

  // Mismo margen que usa la pantalla Hoy: desviación de los ciclos
  // recientes, con suelo de 1 día. Con menos de tres ciclos ni
  // siquiera hay desviación fiable, así que se abre a 3.
  const m = lengths.length ? mean(lengths) : avg;
  const spread =
    lengths.length >= 3
      ? Math.max(
          1,
          Math.round(
            Math.sqrt(mean(lengths.map((x) => (x - m) ** 2))),
          ),
        )
      : 3;

  return {
    periodStart,
    periodEnd: addDays(periodStart, settings.avgPeriodLength - 1),
    startEarliest: addDays(periodStart, -spread),
    startLatest: addDays(periodStart, spread),
    fertileStart,
    fertileEnd,
    fertileNow:
      differenceInCalendarDays(now, fertileStart) >= 0 &&
      differenceInCalendarDays(fertileEnd, now) >= 0,
  };
}

export function buildMonth(
  monthDate: Date,
  cycles: Cycle[],
  days: DayLog[],
  settings: Settings,
  today = todayKey(),
): MonthData {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const lengths = cycleLengths(sorted).slice(-6);
  const avgLength = lengths.length
    ? Math.round(mean(lengths))
    : settings.avgCycleLength;

  // El sangrado se pinta desde los DIAS, no desde el rango del ciclo.
  // Derivando el ciclo de una racha con huecos permitidos, rellenar
  // start..end pintaba de rojo un dia que ella habia dejado sin
  // marcar: justo la contradiccion que el modelo por dias elimina.
  const bleeding = new Set<string>(
    days.filter((d) => d.flow !== undefined && d.flow > 0).map((d) => d.date),
  );
  const fertile = new Set<string>();
  const predicted = new Set<string>();

  sorted.forEach((cycle, i) => {
    const start = fromKey(cycle.startDate);
    const next = sorted[i + 1];

    // --- Ventana fértil de ESE ciclo.
    // La fase lútea dura ~14 días y es la constante; la folicular es
    // la que varía. Así que la ovulación se ancla al final del ciclo,
    // usando su longitud real cuando se conoce.
    const thisLength = next
      ? differenceInCalendarDays(fromKey(next.startDate), start)
      : avgLength;
    if (thisLength >= 15 && thisLength <= 60) {
      // Ojo con el off-by-one: `ovulation` es un DÍA del ciclo (el 1
      // es el primer día de regla), y addDays cuenta OFFSETS desde el
      // inicio. El día N está en el offset N-1.
      const ovulation = thisLength - 14;
      addRange(fertile, addDays(start, ovulation - 1 - 4), 6);
    }
  });

  // --- Reglas previstas: tres ciclos hacia delante y para de contar.
  const last = sorted[sorted.length - 1];
  if (last) {
    for (let k = 1; k <= 3; k++) {
      const start = addDays(fromKey(last.startDate), avgLength * k);
      if (differenceInCalendarDays(start, fromKey(today)) < 0) continue;
      addRange(predicted, start, settings.avgPeriodLength);
    }
  }

  const logs = new Map(days.map((d) => [d.date, d]));

  const gridStart = startOfWeek(startOfMonth(monthDate), WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(monthDate), WEEK_OPTS);
  const all = eachDayOfInterval({ start: gridStart, end: gridEnd });

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
      inMonth: isSameMonth(date, monthDate),
      isToday: key === today,
      isFuture: key > today,
      band,
      bandStart: band !== null && prev !== band,
      bandEnd: band !== null && next !== band,
      flow: log?.flow,
      logged:
        log !== undefined &&
        (log.painLevel !== undefined ||
          log.flow !== undefined ||
          !!log.note ||
          !!log.mood?.length ||
          !!log.symptoms?.length),
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

  return {
    weeks,
    painted: cells.filter((c) => c.inMonth && c.band !== null).length,
  };
}
