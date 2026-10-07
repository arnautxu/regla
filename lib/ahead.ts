import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type DayLog, type Settings } from "./db";
import { withCycleDay } from "./insights";
import { signals } from "./signals";

/* ═══════════════════════════════════════════════════════════════
   LO QUE TE ESPERA

   Los patrones de Historial miran hacia atrás: "tu peor día es el
   2". Esto les da la vuelta y mira hacia delante desde hoy: "mañana
   suele tocar retortijones".

   Las mismas reglas que insights.ts, más estrictas porque esto sale
   en la primera pantalla sin que nadie lo pida:

   · Solo ciclos ya cerrados que llegaron a ese día. El de ahora no
     cuenta: es el que se está intentando prever.
   · Al menos tres ciclos observados, y en la mayoría pasó.
   · Se mira el día con un margen de uno a cada lado: el cuerpo no
     va con reloj y el retortijón del día 2 a veces cae el 1 o el 3.
   ═══════════════════════════════════════════════════════════════ */

const MIN_CYCLES = 3;
const MIN_SHARE = 0.6;
const MARGIN = 1;

export interface Ahead {
  /** Días desde hoy: 1 = mañana */
  inDays: number;
  predicate: string;
  /** En cuántos ciclos de cuántos */
  hits: number;
  of: number;
  text: string;
  /** "Mañana: retortijones", para donde no cabe la frase */
  short: string;
}

export function lookAhead(
  days: DayLog[],
  cycles: Cycle[],
  settings: Settings,
  dayOfCycle: number | undefined,
  /** Cuántos días hacia delante mirar */
  horizon = 3,
): Ahead | null {
  if (dayOfCycle === undefined) return null;
  const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (sorted.length < MIN_CYCLES + 1) return null;

  const excluded = new Set(settings.excludedCycles);
  // Longitud de cada ciclo cerrado: hasta dónde llegó.
  const lengths = new Map<string, number>();
  for (let i = 0; i < sorted.length - 1; i++) {
    if (excluded.has(sorted[i].startDate)) continue;
    lengths.set(
      sorted[i].id,
      differenceInCalendarDays(fromKey(sorted[i + 1].startDate), fromKey(sorted[i].startDate)),
    );
  }

  const logs = withCycleDay(days, sorted).filter((d) => lengths.has(d.cycleId));
  const all = signals(settings.customTags);

  for (let inDays = 1; inDays <= horizon; inDays++) {
    const target = dayOfCycle + inDays;
    const observed = [...lengths.entries()]
      .filter(([, len]) => len >= target)
      .map(([id]) => id);
    if (observed.length < MIN_CYCLES) continue;

    let best: Ahead | null = null;
    for (const s of all) {
      const hit = new Set<string>();
      for (const d of logs) {
        if (Math.abs(d.cycleDay - target) <= MARGIN && s.match(d.log)) hit.add(d.cycleId);
      }
      const hits = observed.filter((id) => hit.has(id)).length;
      if (hits < MIN_CYCLES || hits / observed.length < MIN_SHARE) continue;
      if (!best || hits / observed.length > best.hits / best.of) {
        best = {
          inDays,
          predicate: s.predicate,
          hits,
          of: observed.length,
          text: `${when(inDays)} ${s.predicate}`,
          short: `${when(inDays)}: ${s.noun}`,
        };
      }
    }
    if (best) return best;
  }
  return null;
}

function when(inDays: number): string {
  return inDays === 1 ? "Mañana" : inDays === 2 ? "Pasado mañana" : `En ${inDays} días`;
}
