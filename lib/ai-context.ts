import type { CycleState } from "./cycle";
import { PHASE_LABEL } from "./cycle";
import type { DayLog, HumorLevel } from "./db";
import type { Insight } from "./insights";

/* ═══════════════════════════════════════════════════════════════
   LO QUE SALE DEL MÓVIL

   Solo cifras derivadas. NO viajan: fechas concretas de sus reglas,
   el registro día a día, ni una sola de sus notas escritas.

   Con esto el modelo puede ser específico y útil —sabe en qué día
   está, cuánto le duele hoy y qué patrones se le han detectado— sin
   llevarse su diario. Si algún día hiciera falta más, que sea una
   decisión consciente y no una filtración por comodidad.
   ═══════════════════════════════════════════════════════════════ */

export interface LilitaContext {
  fase?: string;
  diaDelCiclo?: number;
  diaDeRegla?: number;
  sangrando: boolean;
  diasHastaLaProxima?: number;
  margenDias?: number;
  diasDeRetraso: number;
  cicloMedio: number;
  reglaMedia: number;
  ciclosRegistrados: number;
  confianza: CycleState["confidence"];
  dolorHoy?: number;
  diaDeMierda: boolean;
  /** Solo el titular de cada patrón, sin su base de cálculo */
  patrones: string[];
  humor: HumorLevel;
  /** Activa el modo cuidados: cero bromas */
  frenoDeMano: boolean;
}

export function buildContext(
  state: CycleState,
  today: DayLog | undefined,
  humor: HumorLevel,
  insights: Insight[],
): LilitaContext {
  const dolorHoy = today?.painLevel;
  const diaDeMierda = Boolean(today?.badDay);

  return {
    fase: state.phase ? PHASE_LABEL[state.phase] : undefined,
    diaDelCiclo: state.dayOfCycle,
    diaDeRegla: state.periodDay,
    sangrando: state.bleeding,
    diasHastaLaProxima: state.daysUntilNext,
    margenDias: state.model.spread,
    diasDeRetraso: state.daysLate,
    cicloMedio: state.model.length,
    reglaMedia: state.model.periodLength,
    ciclosRegistrados: state.model.basis,
    confianza: state.confidence,
    dolorHoy,
    diaDeMierda,
    patrones: insights.map((i) => i.title),
    humor,
    frenoDeMano: diaDeMierda || (dolorHoy ?? 0) >= 8,
  };
}

/** Huella del contexto: si no cambia, no hace falta regenerar nada. */
export function contextFingerprint(c: LilitaContext): string {
  return JSON.stringify([
    c.fase,
    c.diaDelCiclo,
    c.diaDeRegla,
    c.diasDeRetraso,
    c.dolorHoy,
    c.diaDeMierda,
    c.humor,
  ]);
}
