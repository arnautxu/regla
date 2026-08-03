import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type DayLog, type Settings } from "./db";
import { buildModel, type CycleModel } from "./predict";

export interface CycleSummary {
  id: string;
  startKey: string;
  /** Duración del ciclo. undefined = es el ciclo en curso */
  cycleLength?: number;
  /** Duración de la regla. undefined = no marcó cuándo se fue */
  periodLength?: number;
  ongoing: boolean;
  maxPain?: number;
  badDays: number;
  loggedDays: number;
  notes: string[];
}

/** Ciclos del más reciente al más antiguo, con lo registrado dentro. */
export function summarizeCycles(
  cycles: Cycle[],
  days: DayLog[],
  today: string,
): CycleSummary[] {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  return sorted
    .map((cycle, i): CycleSummary => {
      const next = sorted[i + 1];
      const ongoing = !next;

      const cycleLength = next
        ? differenceInCalendarDays(
            fromKey(next.startDate),
            fromKey(cycle.startDate),
          )
        : undefined;

      const periodLength = cycle.endDate
        ? differenceInCalendarDays(
            fromKey(cycle.endDate),
            fromKey(cycle.startDate),
          ) + 1
        : undefined;

      // Días que caen dentro de este ciclo: desde su inicio hasta el
      // día antes del siguiente (o hasta hoy si es el que corre).
      const until = next ? next.startDate : today;
      const inside = days.filter(
        (d) => d.date >= cycle.startDate && d.date < until,
      );

      const pains = inside
        .map((d) => d.painLevel)
        .filter((p): p is number => p !== undefined);

      return {
        id: cycle.id,
        startKey: cycle.startDate,
        cycleLength,
        periodLength,
        ongoing,
        maxPain: pains.length ? Math.max(...pains) : undefined,
        badDays: inside.filter((d) => d.badDay).length,
        loggedDays: inside.length,
        notes: inside.map((d) => d.note).filter((n): n is string => !!n),
      };
    })
    .reverse();
}

export interface Stats {
  count: number;
  avgCycle?: number;
  avgPeriod?: number;
  shortest?: number;
  longest?: number;
  /** Margen de incertidumbre del modelo, en días */
  spread?: number;
  /** Ciclos que sostienen las cifras, ya descontados los atípicos */
  basis: number;
  confidence: CycleModel["confidence"];
}

/**
 * Las cifras salen del MISMO modelo que predice en Hoy y pinta el
 * calendario. Antes esto hacía su propia media simple, y con un
 * ciclo atípico de 45 días Historial decía "ciclo medio 30" mientras
 * Hoy contaba con 29. Dos pantallas contradiciéndose sin que nadie
 * pudiera saber cuál mentía.
 */
export function computeStats(
  cycles: Cycle[],
  summaries: CycleSummary[],
  settings: Settings,
): Stats {
  const model = buildModel(cycles, settings);
  const periods = summaries
    .map((s) => s.periodLength)
    .filter((p): p is number => p !== undefined);

  if (!model.kept.length) {
    return {
      count: cycles.length,
      avgPeriod: periods.length ? model.periodLength : undefined,
      basis: 0,
      confidence: model.confidence,
    };
  }

  return {
    count: cycles.length,
    avgCycle: model.length,
    avgPeriod: model.periodLength,
    // El rango se lee sobre los ciclos que cuentan. El atípico tiene
    // su propia tarjeta en «Lo que veo» explicando por qué está fuera.
    shortest: Math.min(...model.kept),
    longest: Math.max(...model.kept),
    spread: model.spread,
    basis: model.basis,
    confidence: model.confidence,
  };
}
