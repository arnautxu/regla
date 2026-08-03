import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type Settings } from "./db";

/* ═══════════════════════════════════════════════════════════════
   MOTOR DE PREDICCIÓN

   Todo se calcula en el dispositivo a partir de lo que ella registra.
   Tres decisiones que separan esto de una media simple:

   1. MEDIANA + MAD PARA DESCARTAR RAROS. Un ciclo de 45 días por un
      viaje, una enfermedad o un mes de estrés no puede arrastrar la
      media seis meses. La mediana no se mueve con un valor extremo;
      la media sí.

   2. PESOS QUE DECAEN. Un cuerpo cambia. El ciclo del mes pasado
      informa más que el de hace un año, así que cada ciclo pesa la
      mitad que el siguiente cada tres ciclos hacia atrás.

   3. EL MARGEN SE ENSANCHA CON POCOS DATOS. Con tres ciclos, la
      desviación observada subestima la real. Se corrige con un
      factor que tiende a 1 según crece la muestra, en vez de dar un
      "±1 día" que suena exacto y no lo es.
   ═══════════════════════════════════════════════════════════════ */

/** Vida media del peso, en ciclos. */
const HALF_LIFE = 3;

/** Ventana máxima que se mira hacia atrás. */
const WINDOW = 12;

/** Fuera de aquí no es un ciclo, es un error de registro. */
const MIN_LEN = 15;
const MAX_LEN = 60;

export interface CycleModel {
  /** Longitud típica del ciclo, redondeada */
  length: number;
  /** Longitud típica de la regla, aprendida de sus datos */
  periodLength: number;
  /** Margen de incertidumbre del inicio, en días */
  spread: number;
  confidence: "ninguna" | "baja" | "media" | "alta";
  /** Cuántos ciclos completos sostienen el modelo */
  basis: number;
  /** Longitudes que sí entran en el cálculo */
  kept: number[];
  /** Longitudes descartadas por atípicas */
  discarded: number[];
  /** Tendencia en días por ciclo. Negativo = se acortan. */
  trend?: number;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Desviación absoluta mediana: la dispersión que no se deja engañar. */
function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/** Longitudes entre inicios consecutivos, de más antigua a más reciente. */
export function cycleLengthsOf(cycles: Cycle[]): number[] {
  const sorted = [...cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const len = differenceInCalendarDays(
      fromKey(sorted[i].startDate),
      fromKey(sorted[i - 1].startDate),
    );
    if (len >= MIN_LEN && len <= MAX_LEN) out.push(len);
  }
  return out;
}

/** Duraciones de regla realmente registradas (ciclos ya cerrados). */
export function periodLengthsOf(cycles: Cycle[]): number[] {
  return cycles
    .filter((c) => c.endDate)
    .map(
      (c) =>
        differenceInCalendarDays(fromKey(c.endDate!), fromKey(c.startDate)) + 1,
    )
    .filter((d) => d >= 1 && d <= 14);
}

/**
 * Separa lo normal de lo atípico. El umbral es 3 MAD, que para datos
 * normales equivale a unas 2 desviaciones típicas — bastante para no
 * cortar variación real, suficiente para aislar el mes del viaje.
 */
function rejectOutliers(xs: number[]): { kept: number[]; discarded: number[] } {
  if (xs.length < 4) return { kept: xs, discarded: [] };

  const m = median(xs);
  const d = mad(xs);
  // Si MAD es 0 (ciclos idénticos) cualquier variación sería atípica.
  // En ese caso se admite un día de holgura y ya.
  const limit = Math.max(3 * d, 1.5);

  const kept: number[] = [];
  const discarded: number[] = [];
  for (const x of xs) (Math.abs(x - m) <= limit ? kept : discarded).push(x);

  // Nunca dejar el modelo sin base: si el filtro se pasa de listo, no
  // se filtra nada.
  return kept.length >= 3 ? { kept, discarded } : { kept: xs, discarded: [] };
}

/** Pesos que decaen hacia el pasado. El último elemento pesa 1. */
function weights(n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.pow(0.5, (n - 1 - i) / HALF_LIFE),
  );
}

function weightedMean(xs: number[], w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  return xs.reduce((acc, x, i) => acc + x * w[i], 0) / total;
}

function weightedStdev(xs: number[], w: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const total = w.reduce((a, b) => a + b, 0);
  const v = xs.reduce((acc, x, i) => acc + w[i] * (x - mean) ** 2, 0) / total;
  return Math.sqrt(v);
}

/** Pendiente por mínimos cuadrados: días que se mueve el ciclo por ciclo. */
function slope(xs: number[]): number {
  const n = xs.length;
  const mx = (n - 1) / 2;
  const my = xs.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (xs[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function buildModel(cycles: Cycle[], settings: Settings): CycleModel {
  const all = cycleLengthsOf(cycles);
  const recent = all.slice(-WINDOW);

  const periods = periodLengthsOf(cycles);
  // La duración de la regla se aprende de sus ciclos cerrados. El
  // valor de ajustes es solo la semilla de los primeros meses.
  const periodLength = periods.length
    ? Math.round(median(periods.slice(-6)))
    : settings.avgPeriodLength;

  if (recent.length === 0) {
    return {
      length: settings.avgCycleLength,
      periodLength,
      spread: 4,
      confidence: "ninguna",
      basis: 0,
      kept: [],
      discarded: [],
    };
  }

  const { kept, discarded } = rejectOutliers(recent);
  const w = weights(kept.length);
  const mean = weightedMean(kept, w);
  const sd = weightedStdev(kept, w, mean);

  // Corrección por muestra pequeña: con n bajo la desviación
  // observada se queda corta, así que se ensancha el margen.
  const inflate = 1 + 2 / Math.max(kept.length, 1);
  const spread = Math.max(1, Math.round(Math.max(sd, 0.8) * inflate));

  const confidence: CycleModel["confidence"] =
    kept.length < 2
      ? "baja"
      : kept.length < 4
        ? "baja"
        : sd > 4
          ? "media"
          : kept.length >= 6
            ? "alta"
            : "media";

  // La tendencia se calcula sobre los ciclos que CUENTAN, no sobre
  // los brutos: un solo mes de 45 días inclina la recta y la app se
  // pone a anunciar que "tus ciclos se están alargando" cuando lo
  // único que pasó fue un viaje.
  const trend = kept.length >= 5 ? slope(kept.slice(-8)) : undefined;

  return {
    length: Math.round(mean),
    periodLength,
    spread,
    confidence,
    basis: kept.length,
    kept,
    discarded,
    trend,
  };
}
