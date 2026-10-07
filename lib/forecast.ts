import { phaseByDay, type Phase } from "./phase";

/* ═══════════════════════════════════════════════════════════════
   LA PREVISIÓN, EN UNA FICHA

   Los avisos del ciclo los manda un cron del servidor, y la vista de
   Arnau la lee su móvil. Ninguno de los dos tiene el diario: vive en
   el iPhone de Lídia, y la copia en la nube es opcional.

   Así que el móvil de ella sube esto y nada más: cuándo empezó el
   ciclo, cuánto suele durar y en qué días caen sus ventanas. Ni un
   síntoma, ni una nota, ni un PAS. Con eso el servidor sabe en qué
   día está cada mañana sin tener que leer nada suyo.

   Sin dependencias de la base de datos: se importa desde el servidor.
   ═══════════════════════════════════════════════════════════════ */

export interface Forecast {
  /** Primer día de la regla del ciclo en curso, 'YYYY-MM-DD' */
  cycleStart: string;
  /** Longitud típica del ciclo, aprendida de sus datos */
  length: number;
  periodLength: number;
  /** Margen del inicio previsto, en días */
  spread: number;
  /** Días del ciclo de la semana sensible, si hay patrón */
  sensitive?: { from: number; to: number };
  /** Días del ciclo de la zona Cookie Monster, si hay patrón */
  monster?: { from: number; to: number };
  /** Cuándo la subió el móvil, ISO */
  updatedAt: string;
}

export interface ForecastReading {
  dayOfCycle: number;
  /** Días hasta la regla prevista. Negativo = va con retraso. */
  daysUntil: number;
  phase: Phase;
  sensitiveNow: boolean;
  /** Días que faltan para la semana sensible, si viene en este ciclo */
  sensitiveIn?: number;
  monsterNow: boolean;
  monsterIn?: number;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Lo que dice la ficha sobre un día concreto (hoy, normalmente). */
export function readForecast(f: Forecast, today: string): ForecastReading {
  const dayOfCycle = Math.max(1, dayNumber(today) - dayNumber(f.cycleStart) + 1);
  const daysUntil = f.length - dayOfCycle + 1;
  const inside = (w?: { from: number; to: number }) =>
    !!w && dayOfCycle >= w.from && dayOfCycle <= w.to;
  const ahead = (w?: { from: number; to: number }) =>
    w && w.from > dayOfCycle ? w.from - dayOfCycle : undefined;

  return {
    dayOfCycle,
    daysUntil,
    // Pasada la fecha prevista no se le inventa una fase nueva: sigue
    // en la lútea hasta que baje y el móvil suba otra ficha.
    phase:
      dayOfCycle > f.length ? "lutea" : phaseByDay(dayOfCycle, f.length, f.periodLength),
    sensitiveNow: inside(f.sensitive),
    sensitiveIn: ahead(f.sensitive),
    monsterNow: inside(f.monster),
    monsterIn: ahead(f.monster),
  };
}

/** ¿Es una ficha con sentido? El servidor no se fía de lo que llega. */
export function isForecast(x: unknown): x is Forecast {
  if (!x || typeof x !== "object") return false;
  const f = x as Record<string, unknown>;
  const win = (w: unknown) =>
    w === undefined ||
    (typeof w === "object" &&
      w !== null &&
      Number.isInteger((w as { from: unknown }).from) &&
      Number.isInteger((w as { to: unknown }).to));
  return (
    typeof f.cycleStart === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.cycleStart) &&
    Number.isInteger(f.length) &&
    (f.length as number) >= 15 &&
    (f.length as number) <= 60 &&
    Number.isInteger(f.periodLength) &&
    Number.isInteger(f.spread) &&
    win(f.sensitive) &&
    win(f.monster)
  );
}
