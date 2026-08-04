"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  pillStreak,
  todayKey,
  withDefaults,
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
  /** Días seguidos de pastilla hasta hoy incluido. 0 si hoy falta. */
  pillStreak: number;
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
  //
  // La racha de pastilla sale de la MISMA lectura y no de una consulta
  // aparte: la tabla entera ya está en memoria aquí, así que contar la
  // racha es gratis y una segunda liveQuery sobre lo mismo solo
  // añadiría un repintado más por cada escritura.
  const derived = useLiveQuery(async () => {
    const days = await db.days.toArray();
    return {
      cycles: derivedCycles(days, dateKey),
      streak: pillStreak(days, dateKey),
    };
  }, [dateKey]);
  const cycles = derived?.cycles;
  const today = useLiveQuery(
    async () => (await db.days.get(dateKey)) ?? null,
    [dateKey],
  );

  const ready = settings !== undefined && cycles !== undefined;
  // withDefaults y no `?? DEFAULT_SETTINGS`: una fila guardada antes
  // de que existiera un ajuste existe pero no lo tiene, asi que el
  // `??` no salta y se lee `undefined` de un campo que el resto del
  // codigo da por seguro.
  const resolvedSettings = withDefaults(settings);
  const resolvedCycles = cycles ?? [];

  const state = computeCycleState(
    resolvedCycles,
    resolvedSettings,
    dateKey,
    // undefined = "todavía no lo sé", no "hoy no sangra". Antes
    // `today` sin registrar (null, tras el `?? null` de arriba) caía
    // en bled(undefined) = false, un valor YA decidido que pisaba el
    // fallback de computeCycleState pensado justo para este caso: sin
    // tocar el botón todavía, la cabecera daba por acabada la regla y
    // saltaba a "faltan 26 días" aunque la fase siguiera en regla.
    today === undefined || today === null || today.flow === undefined
      ? undefined
      : bled(today),
  );

  const line = lilitaSays(
    {
      phase: state.phase,
      dayOfCycle: state.dayOfCycle,
      periodDay: state.periodDay,
      daysUntilNext: state.daysUntilNext,
      daysLate: state.daysLate,
      bleeding: state.bleeding,
      pendienteDeHoy:
        !state.bleeding &&
        resolvedCycles.at(-1) !== undefined &&
        resolvedCycles.at(-1)!.endDate === undefined,
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
    pillStreak: derived?.streak ?? 0,
  };
}

/** Vibración corta. iOS solo la da en PWA instalada; si no, no pasa nada. */
export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}
