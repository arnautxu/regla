"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  todayKey,
  DEFAULT_SETTINGS,
  type Cycle,
  type DayLog,
  type Settings,
} from "./db";
import { computeCycleState, type CycleState } from "./cycle";
import { bled, derivedCycles } from "./period-days";
import { lilitaSays, type Line } from "./lilita/lines";

export interface Lilaila {
  ready: boolean;
  settings: Settings;
  cycles: Cycle[];
  today: DayLog | undefined;
  state: CycleState;
  line: Line;
  dateKey: string;
}

/**
 * Estado completo de la app en un solo hook. Todo sale de IndexedDB
 * vía useLiveQuery, así que cualquier escritura desde cualquier
 * pantalla repinta las demás sin tener que orquestar nada.
 */
export function useLilaila(): Lilaila {
  const dateKey = todayKey();

  // Solo lecturas: Dexie prohíbe escribir dentro de un liveQuery, así
  // que aquí no se siembra nada. `null` = fila inexistente todavía,
  // `undefined` = la consulta aún no ha contestado. Distinguirlos es
  // lo que evita pintar valores por defecto como si fueran suyos.
  const settings = useLiveQuery(
    async () => (await db.settings.get("singleton")) ?? null,
    [],
  );
  // Los ciclos se derivan de los dias: una sola verdad. Al escuchar
  // la tabla de dias, marcar el flujo repinta el ciclo al instante.
  const cycles = useLiveQuery(
    async () => derivedCycles(await db.days.toArray(), dateKey),
    [dateKey],
  );
  const today = useLiveQuery(
    async () => (await db.days.get(dateKey)) ?? null,
    [dateKey],
  );

  const ready = settings !== undefined && cycles !== undefined;
  const resolvedSettings = settings ?? DEFAULT_SETTINGS;
  const resolvedCycles = cycles ?? [];

  const state = computeCycleState(
    resolvedCycles,
    resolvedSettings,
    dateKey,
    today === undefined ? undefined : bled(today ?? undefined),
  );

  const line = lilitaSays(
    {
      phase: state.phase,
      dayOfCycle: state.dayOfCycle,
      periodDay: state.periodDay,
      daysUntilNext: state.daysUntilNext,
      daysLate: state.daysLate,
      bleeding: state.bleeding,
      cyclesLogged: state.cyclesLogged,
      painLevel: today?.painLevel,
      badDay: today?.badDay,
      humorLevel: resolvedSettings.humorLevel,
    },
    dateKey,
  );

  return {
    ready,
    settings: resolvedSettings,
    cycles: resolvedCycles,
    today: today ?? undefined,
    state,
    line,
    dateKey,
  };
}

/** Vibración corta. iOS solo la da en PWA instalada; si no, no pasa nada. */
export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
