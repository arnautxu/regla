import { addDays, differenceInCalendarDays } from "date-fns";
import { fromKey, toKey, type Cycle, type DayLog, type Settings } from "./db";
import { FILTER_LABEL, INSIGHT_FILTER, type Crossing, type Filter } from "./crossings";
import type { EpisodeReport } from "./episodes";
import type { CycleSummary } from "./history";
import { withCycleDay, type Insight } from "./insights";
import { buildModel, median } from "./predict";

/* ═══════════════════════════════════════════════════════════════
   TU REGLA, LEÍDA DE TRES MANERAS

   · Tu mes tipo: qué pasa en qué día de un ciclo cualquiera.
   · Este ciclo: el de ahora comparado con lo suyo, no con lo
     "normal" de un folleto.
   · ¿Acierto?: las fechas que yo habría dicho contra las que fueron.

   Mismas reglas que insights.ts: nada sin base y nada de
   diagnósticos. Todo se calcula en el móvil.
   ═══════════════════════════════════════════════════════════════ */

/* ── Tu mes tipo ─────────────────────────────────────────────── */

export interface Marca {
  id: "regla" | "fertil" | "dolor" | "sintoma" | "pas" | "monstruo";
  from: number;
  to: number;
  titulo: string;
  detalle: string;
}

const SINTOMA: Record<string, string> = {
  retortijones: "Retortijones",
  "dolor-lumbar": "Dolor lumbar",
  "tetas-doloridas": "Tetas doloridas",
  migrana: "Migraña",
  hinchazon: "Hinchazón",
  acne: "Granos",
  insomnio: "Insomnio",
  cagalera: "Cagalera",
  antojos: "Antojos",
  cansancio: "Cansancio",
};

function cuantil(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}

export function mesTipo(
  cycles: Cycle[],
  days: DayLog[],
  settings: Settings,
  reports: { pas: EpisodeReport; monster: EpisodeReport },
): { length: number; marcas: Marca[] } {
  const model = buildModel(cycles, settings);
  const length = model.length;
  const marcas: Marca[] = [
    {
      id: "regla",
      from: 1,
      to: model.periodLength,
      titulo: "La regla",
      detalle: `${model.periodLength} días, de mediana.`,
    },
  ];

  // Días fértiles estimados: los cinco antes de ovular y el de después.
  const ov = length - 14;
  if (model.confidence !== "ninguna") {
    marcas.push({
      id: "fertil",
      from: ov - 4,
      to: ov + 1,
      titulo: "Días fértiles",
      detalle: "Estimados por la duración de tus ciclos, no medidos.",
    });
  }

  const dated = withCycleDay(days, cycles);

  // El peor día de dolor, con dos ciclos al menos detrás.
  const porDia = new Map<number, number[]>();
  for (const d of dated) {
    if (d.log.painLevel === undefined) continue;
    const arr = porDia.get(d.cycleDay) ?? [];
    arr.push(d.log.painLevel);
    porDia.set(d.cycleDay, arr);
  }
  const ciclosConDolor = new Set(dated.filter((d) => d.log.painLevel !== undefined).map((d) => d.cycleId));
  if (ciclosConDolor.size >= 2) {
    const pico = [...porDia.entries()]
      .filter(([, v]) => v.length >= 2)
      .map(([day, v]) => ({ day, avg: v.reduce((a, b) => a + b, 0) / v.length }))
      .reduce<{ day: number; avg: number } | null>((a, b) => (!a || b.avg > a.avg ? b : a), null);
    if (pico && pico.avg >= 4) {
      marcas.push({
        id: "dolor",
        from: pico.day,
        to: pico.day,
        titulo: `Día ${pico.day}: el que más duele`,
        detalle: `De media un ${Math.round(pico.avg)} sobre 10.`,
      });
    }
  }

  // El síntoma que más se repite y dónde se agrupa.
  const cuenta = new Map<string, number[]>();
  for (const d of dated) {
    for (const s of d.log.symptoms ?? []) {
      const arr = cuenta.get(s) ?? [];
      arr.push(d.cycleDay);
      cuenta.set(s, arr);
    }
  }
  const sintomas = [...cuenta.entries()]
    .filter(([, v]) => v.length >= 4)
    .sort((a, b) => b[1].length - a[1].length);
  for (const [s, v] of sintomas) {
    const sorted = [...v].sort((a, b) => a - b);
    const from = cuantil(sorted, 0.2);
    const to = cuantil(sorted, 0.8);
    // Repartido por todo el ciclo no es una marca, es ruido.
    if (to - from > 10) continue;
    // La regla ya se ve; un síntoma que solo cae en ella no aporta.
    if (to <= model.periodLength) continue;
    marcas.push({
      id: "sintoma",
      from,
      to,
      titulo: SINTOMA[s] ?? s,
      detalle: `Lo marcas casi siempre ahí (${v.length} veces).`,
    });
    break;
  }

  const ep = (r: EpisodeReport, id: "pas" | "monstruo", titulo: string) => {
    if (!r.window) return;
    marcas.push({
      id,
      from: r.window.from,
      to: r.window.to,
      titulo,
      detalle: `${r.window.count} de ${r.window.total} caen ahí.`,
    });
  };
  ep(reports.pas, "pas", "PAS");
  ep(reports.monster, "monstruo", "Cookie Monster");

  return { length, marcas: marcas.sort((a, b) => a.from - b.from) };
}

/* ── Este ciclo, contra los tuyos ────────────────────────────── */

export interface Comparacion {
  label: string;
  ahora: string;
  normal: string;
  /** Cómo va respecto a lo suyo */
  tono: "igual" | "mejor" | "peor";
}

export interface CicloActual {
  dia: number;
  length: number;
  proxima: Date;
  spread: number;
  frase: string;
  filas: Comparacion[];
  /** Lo que su mes tipo dice que está por llegar en este ciclo */
  viene: { fecha: Date; texto: string }[];
}

export function cicloActual(
  summaries: CycleSummary[],
  days: DayLog[],
  cycles: Cycle[],
  settings: Settings,
  todayKey: string,
  marcas: Marca[] = [],
): CicloActual | null {
  const actual = summaries.find((s) => s.ongoing);
  const pasados = summaries.filter((s) => !s.ongoing).slice(0, 6);
  if (!actual || pasados.length < 2) return null;

  const model = buildModel(cycles, settings);
  const dia = differenceInCalendarDays(fromKey(todayKey), fromKey(actual.startKey)) + 1;
  const proxima = addDays(fromKey(actual.startKey), model.length);

  // Lo de cada ciclo pasado hasta el mismo día: comparar el ciclo
  // entero con medio ciclo diría siempre que este va "mejor".
  const hasta = (s: CycleSummary) => toKey(addDays(fromKey(s.startKey), dia - 1));
  const dentro = (s: CycleSummary) => {
    const fin = hasta(s);
    return days.filter((d) => d.date >= s.startKey && d.date <= fin);
  };
  const dolorMax = (ds: DayLog[]) => Math.max(0, ...ds.map((d) => d.painLevel ?? 0));
  const cuentaEp = (ds: DayLog[]) =>
    ds.reduce((n, d) => n + (d.cryEvents?.length ?? 0) + (d.angerEvents?.length ?? 0), 0);
  const malos = (ds: DayLog[]) => ds.filter((d) => d.badDay).length;

  const ahoraDias = dentro(actual);
  const filas: Comparacion[] = [];
  const comparar = (label: string, ahora: number, antes: number[], unidad: (n: number) => string, menosEsMejor = true) => {
    const normal = Math.round(median(antes));
    const diff = ahora - normal;
    const tono: Comparacion["tono"] =
      Math.abs(diff) <= 1 ? "igual" : (diff < 0) === menosEsMejor ? "mejor" : "peor";
    filas.push({ label, ahora: unidad(ahora), normal: unidad(normal), tono });
  };

  if (actual.periodLength) {
    const antes = pasados.map((s) => s.periodLength).filter((n): n is number => n !== undefined);
    if (antes.length >= 2) comparar("Regla", actual.periodLength, antes, (n) => `${n} días`, false);
    // En la regla, más o menos días no es "mejor": se marca como igual o distinto.
    const f = filas.at(-1);
    if (f && f.tono === "mejor") f.tono = "peor";
  }
  comparar("Dolor máximo", dolorMax(ahoraDias), pasados.map((s) => dolorMax(dentro(s))), (n) => `${n}/10`);
  comparar("PAS y enfados", cuentaEp(ahoraDias), pasados.map((s) => cuentaEp(dentro(s))), (n) => String(n));
  comparar("Días de mierda", malos(ahoraDias), pasados.map((s) => malos(dentro(s))), (n) => String(n));

  const peores = filas.filter((f) => f.tono === "peor").length;
  const mejores = filas.filter((f) => f.tono === "mejor").length;
  const frase =
    peores === 0 && mejores === 0
      ? "Un ciclo de los tuyos, sin sorpresas."
      : peores > mejores
        ? "Este viene más cabrón que de costumbre."
        : mejores > peores
          ? "Este te está tratando mejor que los anteriores."
          : "Un poco de todo: unas cosas mejor y otras peor.";

  const QUE: Partial<Record<Marca["id"], (m: Marca) => string>> = {
    fertil: () => "Empiezan los días fértiles",
    dolor: () => "Tu día de más dolor",
    sintoma: (m) => `Suele llegar: ${m.titulo.toLowerCase()}`,
    pas: () => "Empieza tu zona de PAS",
    monstruo: () => "Empieza la zona Cookie Monster",
  };
  const viene = marcas
    .filter((m) => m.from > dia && QUE[m.id])
    .map((m) => ({ fecha: addDays(fromKey(actual.startKey), m.from - 1), texto: QUE[m.id]!(m) }));
  viene.push({ fecha: proxima, texto: "Te baja la regla" });

  return { dia, length: model.length, proxima, spread: model.spread, frase, filas, viene };
}

/* ── ¿Acierto? ───────────────────────────────────────────────── */

export interface Acierto {
  startKey: string;
  /** Días de error: positivo = llegó más tarde de lo que dije */
  error: number;
  /** El ciclo anterior lo marcó ella como raro */
  raro: boolean;
}

/**
 * Para cada ciclo cerrado, la fecha que habría dicho el modelo con
 * lo que sabía entonces, contra la que fue. Hacen falta tres ciclos
 * antes para que la predicción sea de verdad una predicción.
 */
export function aciertos(cycles: Cycle[], settings: Settings): {
  lista: Acierto[];
  dentro: number;
  margen: number;
} {
  const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lista: Acierto[] = [];
  for (let i = 3; i < sorted.length; i++) {
    const antes = sorted.slice(0, i);
    const model = buildModel(antes, settings);
    const dicho = addDays(fromKey(antes.at(-1)!.startDate), model.length);
    const error = differenceInCalendarDays(fromKey(sorted[i].startDate), dicho);
    if (Math.abs(error) > 20) continue; // un hueco sin registrar, no un fallo
    const raro = (settings.excludedCycles ?? []).includes(antes.at(-1)!.startDate);
    lista.push({ startKey: sorted[i].startDate, error, raro });
  }
  const ult = lista.slice(-6);
  const margen = 2;
  const cuentan = ult.filter((a) => !a.raro);
  return { lista: ult, dentro: cuentan.filter((a) => Math.abs(a.error) <= margen).length, margen };
}

/* ── Todo lo que veo, con los filtros encendidos ─────────────── */

export interface Hallazgo {
  id: string;
  antetitulo: string;
  title: string;
  detail: string;
  basis: number;
  aviso?: boolean;
}

/**
 * Antes Historial enseñaba una conclusión y el resto se perdía. Aquí
 * van todas las que dan los filtros, en el orden en que valen: avisos
 * médicos, cruces, patrones de un filtro y los de PAS y enfados.
 */
export function hallazgos(
  on: ReadonlySet<Filter>,
  singles: Insight[],
  crossed: Crossing[],
  reports: { pas: EpisodeReport; monster: EpisodeReport },
  max = 6,
): Hallazgo[] {
  const out: Hallazgo[] = [];
  const vistos = new Set<string>();
  const add = (h: Hallazgo) => {
    if (vistos.has(h.id)) return;
    vistos.add(h.id);
    out.push(h);
  };
  const filtro = (i: Insight) => INSIGHT_FILTER[i.id] ?? "regla";
  const mine = singles.filter((i) => on.has(filtro(i)));

  for (const i of mine.filter((i) => i.kind === "aviso")) {
    add({ ...i, antetitulo: "Coméntalo con un médico", aviso: true });
  }
  for (const c of crossed.filter((c) => c.kind === "patron")) {
    add({ ...c, antetitulo: c.over.map((f) => FILTER_LABEL[f]).join(" + ") });
  }
  for (const i of mine.filter((i) => i.kind === "patron")) {
    add({ ...i, antetitulo: FILTER_LABEL[filtro(i)] });
  }
  if (on.has("pas")) for (const i of reports.pas.insights) add({ ...i, antetitulo: "PAS" });
  if (on.has("monstruo")) {
    for (const i of reports.monster.insights) add({ ...i, antetitulo: "Cookie Monster" });
  }
  for (const c of crossed) add({ ...c, antetitulo: c.over.map((f) => FILTER_LABEL[f]).join(" + ") });
  for (const i of mine) add({ ...i, antetitulo: FILTER_LABEL[filtro(i)] });
  return out.slice(0, max);
}
