import { differenceInCalendarDays } from "date-fns";
import { fromKey, todayKey, type Cycle, type Settings } from "./db";
import { buildModel, cycleLengthsOf, type CycleModel } from "./predict";

export type Phase = "menstrual" | "folicular" | "ovulacion" | "lutea";

export const PHASE_LABEL: Record<Phase, string> = {
  menstrual: "Regla",
  folicular: "Folicular",
  ovulacion: "Fértil",
  lutea: "Lútea",
};

export interface CycleState {
  /** undefined si aún no ha registrado nada */
  phase?: Phase;
  /** Día del ciclo, 1 = primer día de la regla */
  dayOfCycle?: number;
  /** ¿Está sangrando ahora mismo? */
  bleeding: boolean;
  /** Día de la regla (1..n) si está sangrando */
  periodDay?: number;
  /** Días hasta el inicio previsto. Negativo = va con retraso. */
  daysUntilNext?: number;
  /** Rango previsto de inicio, como número de días desde hoy */
  predictionRange?: { earliest: number; latest: number };
  /** Cuánta confianza merece la predicción */
  confidence: "ninguna" | "baja" | "media" | "alta";
  /** Longitud media de ciclo observada (o la de ajustes si no hay datos) */
  avgLength: number;
  /** Ciclos completos registrados */
  cyclesLogged: number;
  /** Días de retraso sobre la fecha prevista (0 si no va tarde) */
  daysLate: number;
  /** El "hoy" con el que se calculó todo, para que la UI no use otro */
  todayKey: string;
  /** El modelo aprendido de sus ciclos, por si la UI quiere detalle */
  model: CycleModel;
}

/** Re-export por compatibilidad: la lógica vive en predict.ts. */
export const cycleLengths = cycleLengthsOf;

/**
 * El estado del ciclo hoy, a partir del modelo aprendido de sus
 * propios datos (ver predict.ts). Se expone como rango a propósito:
 * fingir una fecha exacta sobre el cuerpo de alguien es mentirle
 * con estilo.
 */
export function computeCycleState(
  cycles: Cycle[],
  settings: Settings,
  today = todayKey(),
  /**
   * Si hoy hay sangrado registrado. Se pasa desde fuera porque el
   * dato vive en el registro del dia, no en el ciclo: deducirlo de
   * la ventana del ciclo permitia que la pantalla dijera "dia 4 de
   * regla" con el dia marcado como "Nada".
   */
  bleedingToday?: boolean,
): CycleState {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const current = sorted[sorted.length - 1];

  const model = buildModel(sorted, settings);
  const avgLength = model.length;
  const confidence = model.confidence;

  if (!current) {
    return {
      bleeding: false,
      confidence: "ninguna",
      avgLength,
      cyclesLogged: 0,
      daysLate: 0,
      todayKey: today,
      model,
    };
  }

  const todayDate = fromKey(today);
  const dayOfCycle =
    differenceInCalendarDays(todayDate, fromKey(current.startDate)) + 1;

  // Registro en el futuro (fecha del móvil movida, o dedazo): tratamos
  // el ciclo como si empezara hoy en vez de devolver un día 0 o negativo.
  if (dayOfCycle < 1) {
    return {
      phase: "menstrual",
      dayOfCycle: 1,
      // Tambien aqui manda el registro del dia: antes esta rama
      // devolvia "sangrando" a secas y se colaba por delante.
      bleeding: bleedingToday ?? !current.endDate,
      periodDay: bleedingToday === false ? undefined : 1,
      confidence,
      avgLength,
      cyclesLogged: model.basis,
      daysLate: 0,
      todayKey: today,
      model,
    };
  }

  // Sangra hoy = hoy tiene flujo registrado. Sin ese dato (llamadas
  // antiguas) se cae a la deduccion por ventana, que es peor pero no
  // rompe nada.
  const bleeding =
    bleedingToday ??
    (!current.endDate && dayOfCycle <= Math.max(model.periodLength + 3, 8));

  const periodDay = bleeding ? dayOfCycle : undefined;

  const daysUntilNext = avgLength - dayOfCycle + 1;
  const spread = model.spread;
  const predictionRange = {
    earliest: daysUntilNext - spread,
    latest: daysUntilNext + spread,
  };

  const daysLate = daysUntilNext < 0 ? -daysUntilNext : 0;

  return {
    phase: phaseFor(dayOfCycle, avgLength, settings, current, bleeding),
    dayOfCycle,
    bleeding,
    periodDay,
    daysUntilNext,
    predictionRange,
    confidence,
    avgLength,
    cyclesLogged: model.basis,
    daysLate,
    todayKey: today,
    model,
  };
}

/**
 * Fase a partir solo del día y la longitud del ciclo. La versión sin
 * contexto, para análisis sobre registros sueltos.
 */
export function phaseByDay(
  day: number,
  length: number,
  periodLength = 5,
): Phase {
  if (day <= periodLength) return "menstrual";
  const ovulation = length - 14;
  if (day >= ovulation - 4 && day <= ovulation + 1) return "ovulacion";
  if (day < ovulation) return "folicular";
  return "lutea";
}

function phaseFor(
  day: number,
  avgLength: number,
  settings: Settings,
  cycle: Cycle,
  bleeding: boolean,
): Phase {
  const periodLength = cycle.endDate
    ? differenceInCalendarDays(fromKey(cycle.endDate), fromKey(cycle.startDate)) + 1
    : settings.avgPeriodLength;


  if (bleeding || day <= periodLength) return "menstrual";

  // La fase lútea es la constante (~14 días); lo que varía entre
  // mujeres y entre ciclos es la folicular. Se ancla la ovulación al
  // final, no al principio.
  const ovulation = avgLength - 14;
  if (day >= ovulation - 4 && day <= ovulation + 1) return "ovulacion";
  if (day < ovulation) return "folicular";
  return "lutea";
}
