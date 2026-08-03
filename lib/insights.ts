import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type DayLog, type Settings } from "./db";
import { buildModel, median, periodLengthsOf } from "./predict";
import type { Phase } from "./cycle";

/* ═══════════════════════════════════════════════════════════════
   PATRONES

   Hasta ahora la app registraba y no devolvía nada. Esto lee lo que
   ella ha ido apuntando y busca lo que se repite.

   Dos reglas que gobiernan todo el fichero:

   · NADA SIN BASE. Cada patrón declara cuántas observaciones lo
     sostienen y no se enseña por debajo de un mínimo. Decirle "tu
     peor día es el 2" con dos registros es inventárselo con cara de
     dato.

   · NI UN DIAGNÓSTICO. Los avisos describen lo observado y sugieren
     consultar. No nombran enfermedades. Esto es una gota de sangre
     animada, no una consulta de ginecología.
   ═══════════════════════════════════════════════════════════════ */

export type InsightKind = "patron" | "aviso" | "dato";

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** Observaciones que lo sostienen. Se enseña en la UI. */
  basis: number;
}

/** A qué día de ciclo corresponde cada registro. */
function withCycleDay(
  days: DayLog[],
  cycles: Cycle[],
): { log: DayLog; cycleDay: number; cycleId: string }[] {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  const out: { log: DayLog; cycleDay: number; cycleId: string }[] = [];
  for (const log of days) {
    const cycle = [...sorted].reverse().find((c) => c.startDate <= log.date);
    if (!cycle) continue;
    const cycleDay =
      differenceInCalendarDays(fromKey(log.date), fromKey(cycle.startDate)) + 1;
    // Más allá de 45 días el registro pertenece a un hueco sin
    // ciclo declarado; asignarlo falsearía el patrón.
    if (cycleDay < 1 || cycleDay > 45) continue;
    out.push({ log, cycleDay, cycleId: cycle.id });
  }
  return out;
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/* ── 1. ¿Qué día duele más? ──────────────────────────────────── */

function painPeak(
  days: DayLog[],
  cycles: Cycle[],
): Insight | null {
  const withPain = withCycleDay(days, cycles).filter(
    (d) => d.log.painLevel !== undefined,
  );
  if (withPain.length < 6) return null;

  // Solo tiene sentido si el patrón se repite entre ciclos.
  const cyclesSeen = new Set(withPain.map((d) => d.cycleId));
  if (cyclesSeen.size < 2) return null;

  const byDay = new Map<number, number[]>();
  for (const d of withPain) {
    const arr = byDay.get(d.cycleDay) ?? [];
    arr.push(d.log.painLevel!);
    byDay.set(d.cycleDay, arr);
  }

  // Días con al menos dos observaciones, para no coronar un pico
  // que solo pasó una vez.
  const candidates = [...byDay.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([day, v]) => ({ day, avg: mean(v), n: v.length }));
  if (!candidates.length) return null;

  const peak = candidates.reduce((a, b) => (b.avg > a.avg ? b : a));
  if (peak.avg < 4) return null; // sin dolor reseñable, no hay patrón

  return {
    id: "pico-dolor",
    kind: "patron",
    title: `Tu peor día es el ${peak.day}`,
    detail: `Es cuando más dolor marcas, de media ${peak.avg.toFixed(0)} sobre 10. Si vas a necesitar un día de sofá, apuesta por ese.`,
    basis: peak.n,
  };
}

/* ── 2. ¿Se están moviendo los ciclos? ───────────────────────── */

function trend(cycles: Cycle[], settings: Settings): Insight | null {
  const model = buildModel(cycles, settings);
  if (model.trend === undefined || model.basis < 5) return null;

  const perSixMonths = Math.abs(model.trend) * 6;
  if (perSixMonths < 1.5) return null; // ruido, no tendencia

  const shortening = model.trend < 0;
  return {
    id: "tendencia",
    kind: "patron",
    title: shortening
      ? "Tus ciclos se están acortando"
      : "Tus ciclos se están alargando",
    detail: `Al ritmo de los últimos meses, unos ${perSixMonths.toFixed(0)} días ${
      shortening ? "menos" : "más"
    } cada medio año. Puede ser una racha o puede ser tu cuerpo cambiando; con más meses lo sabremos.`,
    basis: model.basis,
  };
}

/* ── 3. Longitud fuera del rango habitual ────────────────────── */

function lengthFlag(cycles: Cycle[], settings: Settings): Insight | null {
  const model = buildModel(cycles, settings);
  if (model.confidence === "ninguna" || model.basis < 4) return null;
  if (model.length >= 21 && model.length <= 35) return null;

  const corto = model.length < 21;
  return {
    id: "longitud-atipica",
    kind: "aviso",
    title: corto ? "Tus ciclos son cortos" : "Tus ciclos son largos",
    detail: `Te salen de media ${model.length} días. Lo habitual va de 21 a 35, así que esto es de las cosas que merece la pena comentar en una revisión. No te asustes: fuera de rango no significa que pase nada malo.`,
    basis: model.basis,
  };
}

/* ── 4. Reglas largas ────────────────────────────────────────── */

function longPeriods(cycles: Cycle[]): Insight | null {
  const lengths = periodLengthsOf(cycles);
  if (lengths.length < 3) return null;
  const m = median(lengths.slice(-6));
  if (m <= 7) return null;

  return {
    id: "regla-larga",
    kind: "aviso",
    title: "Tus reglas duran bastante",
    detail: `De mediana ${m} días. Por encima de siete es otra de las que conviene mencionar al médico, sobre todo si vas muy cargada.`,
    basis: lengths.length,
  };
}

/* ── 5. Dolor severo que se repite ───────────────────────────── */

function severePain(days: DayLog[], cycles: Cycle[]): Insight | null {
  const severe = withCycleDay(days, cycles).filter(
    (d) => (d.log.painLevel ?? 0) >= 8,
  );
  const affected = new Set(severe.map((d) => d.cycleId));
  if (affected.size < 3) return null;

  return {
    id: "dolor-severo",
    kind: "aviso",
    title: `Dolor fuerte en ${affected.size} ciclos`,
    detail:
      "Has marcado 8 o más en varios meses seguidos. Un dolor que te tumba no es «lo normal de la regla», es algo que un médico debería mirar. Enséñale esta pantalla.",
    basis: severe.length,
  };
}

/* ── 6. Irregularidad ────────────────────────────────────────── */

function irregular(cycles: Cycle[], settings: Settings): Insight | null {
  const model = buildModel(cycles, settings);
  if (model.basis < 5 || model.spread < 7) return null;

  return {
    id: "irregular",
    kind: "aviso",
    title: "Tus ciclos bailan mucho",
    detail: `El margen de error de mis predicciones es de ±${model.spread} días, que es mucho. Con esta variación no me fío ni yo, así que tómate las fechas como orientativas.`,
    basis: model.basis,
  };
}

/* ── 7. ¿En qué fase lo pasa peor? ───────────────────────────── */

function worstPhase(
  days: DayLog[],
  cycles: Cycle[],
  settings: Settings,
  phaseOf: (day: number, len: number) => Phase,
): Insight | null {
  const model = buildModel(cycles, settings);
  if (model.confidence === "ninguna") return null;

  const rated = withCycleDay(days, cycles).filter(
    (d) => d.log.painLevel !== undefined,
  );
  if (rated.length < 8) return null;

  // La fase menstrual queda FUERA de la comparación. Que duela más
  // durante la regla que el resto del mes no es un hallazgo, es la
  // definición — y presentarlo como patrón hace que todo lo demás de
  // esta pantalla parezca igual de obvio. Lo interesante es si la
  // lútea le pega más fuerte que la folicular.
  const byPhase = new Map<Phase, number[]>();
  for (const d of rated) {
    const p = phaseOf(d.cycleDay, model.length);
    if (p === "menstrual") continue;
    const arr = byPhase.get(p) ?? [];
    arr.push(d.log.painLevel!);
    byPhase.set(p, arr);
  }

  const scored = [...byPhase.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([phase, v]) => ({ phase, avg: mean(v), n: v.length }));
  if (scored.length < 2) return null;

  const worst = scored.reduce((a, b) => (b.avg > a.avg ? b : a));
  const best = scored.reduce((a, b) => (b.avg < a.avg ? b : a));
  if (worst.avg - best.avg < 2) return null; // sin diferencia real

  return {
    id: "peor-fase",
    kind: "patron",
    title: `Lo pasas peor en fase ${PHASE_WORD[worst.phase]}`,
    detail: `Ahí marcas de media ${worst.avg.toFixed(1)} de dolor, frente a ${
      best.avg < 0.5 ? "prácticamente nada" : best.avg.toFixed(1)
    } en ${PHASE_WORD[best.phase]}. No estás loca: hay un patrón y es tuyo.`,
    basis: worst.n + best.n,
  };
}

const PHASE_WORD: Record<Phase, string> = {
  menstrual: "menstrual",
  folicular: "folicular",
  ovulacion: "fértil",
  lutea: "lútea",
};

/* ── 8. Ciclos descartados por atípicos ──────────────────────── */

function outlierNote(cycles: Cycle[], settings: Settings): Insight | null {
  const model = buildModel(cycles, settings);
  if (!model.discarded.length) return null;

  return {
    id: "atipicos",
    kind: "dato",
    title: `${model.discarded.length} ciclo${model.discarded.length > 1 ? "s" : ""} fuera de la media`,
    detail: `Hubo ${model.discarded.length === 1 ? "uno de" : "unos de"} ${model.discarded.join(" y ")} días que no cuento para predecir. Un mes suelto muy raro suele ser estrés, un viaje o estar mala — no tu ritmo real.`,
    basis: model.discarded.length,
  };
}

/* ── 9. Constancia del registro ──────────────────────────────── */

function consistency(days: DayLog[], todayKey: string): Insight | null {
  const cutoff = new Date(fromKey(todayKey));
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const recent = days.filter((d) => d.date >= cutoffKey && d.date <= todayKey);
  if (recent.length < 3) return null;

  return {
    id: "constancia",
    kind: "dato",
    title: `${recent.length} días registrados este mes`,
    detail:
      recent.length >= 20
        ? "Con este nivel de detalle mis predicciones van a ir muy finas. Sigue así."
        : "Cuantos más días marques, mejores serán mis cuentas. Tampoco hace falta que sea cada día.",
    basis: recent.length,
  };
}

/* ── Orquestador ─────────────────────────────────────────────── */

const ORDER: Record<InsightKind, number> = { aviso: 0, patron: 1, dato: 2 };

export function computeInsights(
  cycles: Cycle[],
  days: DayLog[],
  settings: Settings,
  todayKey: string,
  phaseOf: (day: number, len: number) => Phase,
): Insight[] {
  const found = [
    severePain(days, cycles),
    lengthFlag(cycles, settings),
    longPeriods(cycles),
    irregular(cycles, settings),
    painPeak(days, cycles),
    worstPhase(days, cycles, settings, phaseOf),
    trend(cycles, settings),
    outlierNote(cycles, settings),
    consistency(days, todayKey),
  ].filter((i): i is Insight => i !== null);

  // Los avisos primero: si algo merece una consulta médica, no puede
  // quedar debajo de "llevas 12 días registrados".
  return found.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
