import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type DayLog, type MoodTag } from "./db";
import type { EpisodeReport } from "./episodes";
import type { Insight } from "./insights";
import { ANIMOS, labelOf } from "./labels";
import { bled } from "./period-days";

/* ═══════════════════════════════════════════════════════════════
   UN HISTORIAL, CON FILTROS

   Regla, dolor, ánimo, PAS y Cookie Monster se pueden encender y
   apagar. Con uno solo se ven sus patrones de siempre; con varios
   salen los cruces: si los PAS llegan antes de la regla, si el dolor
   fuerte trae llanto, qué ánimo marca los días de enfado…

   Las mismas reglas que insights.ts y episodes.ts: nada sin base,
   y todo se calcula en el móvil. El PAS no sale de aquí.
   ═══════════════════════════════════════════════════════════════ */

export type Filter = "regla" | "dolor" | "animo" | "pas" | "monstruo";

export const FILTERS: { value: Filter; label: string; color: string }[] = [
  { value: "regla", label: "Regla", color: "var(--ph-menstrual)" },
  { value: "dolor", label: "Dolor", color: "var(--fg)" },
  { value: "animo", label: "Ánimo", color: "var(--ph-lutea)" },
  { value: "pas", label: "PAS", color: "var(--accent)" },
  { value: "monstruo", label: "Cookie Monster", color: "var(--cookie)" },
];

export const FILTER_LABEL = Object.fromEntries(
  FILTERS.map((f) => [f.value, f.label]),
) as Record<Filter, string>;

/** A qué filtro pertenece cada patrón de insights.ts. */
export const INSIGHT_FILTER: Record<string, Filter> = {
  tendencia: "regla",
  "longitud-atipica": "regla",
  "regla-larga": "regla",
  irregular: "regla",
  atipicos: "regla",
  constancia: "regla",
  "pico-dolor": "dolor",
  "dolor-severo": "dolor",
  "peor-fase": "animo",
  "sintoma-top": "animo",
  "etiqueta-top": "animo",
};

/** Un cruce dice de qué filtros sale, para poder titularlo. */
export interface Crossing extends Insight {
  over: Filter[];
}

type Episode = "pas" | "monstruo";

const NOUN: Record<Episode, string> = { pas: "PAS", monstruo: "enfados" };
const THE: Record<Episode, string> = { pas: "Los PAS", monstruo: "Los enfados" };

function had(log: DayLog, kind: Episode) {
  return kind === "pas" ? !!log.cryEvents?.length : !!log.angerEvents?.length;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function quantile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}

/* ── Episodios + regla: ¿cuántos días antes llegan? ───────────── */

function beforePeriod(kind: Episode, days: DayLog[], cycles: Cycle[]): Crossing | null {
  const starts = [...cycles].map((c) => c.startDate).sort();
  const gaps: number[] = [];
  const seen = new Set<string>();
  let during = 0;
  let total = 0;
  for (const log of days) {
    if (!had(log, kind)) continue;
    total++;
    if (bled(log)) during++;
    // Solo cuentan los que tienen una regla después: la del ciclo en
    // curso todavía no ha llegado y cualquier número sería inventado.
    const next = starts.find((s) => s > log.date);
    if (!next) continue;
    const gap = differenceInCalendarDays(fromKey(next), fromKey(log.date));
    if (gap > 40) continue;
    gaps.push(gap);
    seen.add(next);
  }
  if (gaps.length < 6 || seen.size < 3) return null;

  const sorted = gaps.sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const duringText =
    during === 0
      ? "Con la regla ya bajando, ninguno."
      : `Con la regla ya bajando, ${during} de ${total}.`;

  if (q3 - q1 > 10) {
    return {
      id: `${kind}-regla`,
      over: [kind, "regla"],
      kind: "dato",
      title: `${THE[kind]} no siguen a la regla`,
      detail: `Caen igual de repartidos a lo largo del ciclo: no hay una distancia fija hasta la regla. ${duringText}`,
      basis: gaps.length,
    };
  }
  return {
    id: `${kind}-regla`,
    over: [kind, "regla"],
    kind: "patron",
    title: `${THE[kind]} llegan unos ${med} días antes de la regla`,
    detail: `La mitad cae entre ${q1 === q3 ? q1 : `${Math.min(q1, q3)} y ${Math.max(q1, q3)}`} días antes de que baje. ${duringText}`,
    basis: gaps.length,
  };
}

/* ── Episodios + dolor: ¿el dolor fuerte los trae? ────────────── */

function withPain(kind: Episode, days: DayLog[]): Crossing | null {
  const measured = days.filter((d) => d.painLevel !== undefined);
  const ep = measured.filter((d) => had(d, kind));
  const rest = measured.filter((d) => !had(d, kind));
  if (ep.length < 5 || rest.length < 5) return null;

  const strong = (d: DayLog) => (d.painLevel ?? 0) >= 6;
  const a = ep.filter(strong).length;
  const shareEp = a / ep.length;
  const shareRest = rest.filter(strong).length / rest.length;

  if (a >= 3 && shareEp >= shareRest * 1.5 && shareEp - shareRest >= 0.15) {
    return {
      id: `${kind}-dolor`,
      over: [kind, "dolor"],
      kind: "patron",
      title:
        kind === "pas"
          ? "El dolor fuerte te hace llorar más"
          : "Con dolor fuerte te enfadas más",
      detail: `${a} de ${ep.length} días con ${NOUN[kind]} tenías un 6 o más de dolor. El resto de días, solo el ${pct(shareRest)}.`,
      basis: ep.length,
    };
  }
  if (shareEp <= shareRest * 1.1 + 0.05) {
    return {
      id: `${kind}-dolor`,
      over: [kind, "dolor"],
      kind: "dato",
      title:
        kind === "pas"
          ? "El dolor no es lo que te hace llorar"
          : "El dolor no es lo que te enfada",
      detail: `Solo ${a} de ${ep.length} días con ${NOUN[kind]} tenías un 6 o más de dolor, igual que cualquier otro día.`,
      basis: ep.length,
    };
  }
  return null;
}

/* ── Episodios + ánimo: ¿qué marcas esos días? ────────────────── */

type Tag = MoodTag | "mal-dia";

function tagsOf(d: DayLog): Tag[] {
  return [...(d.mood ?? []), ...(d.badDay ? (["mal-dia"] as const) : [])];
}

function tagLabel(t: Tag) {
  return t === "mal-dia" ? "Día de mierda" : (labelOf(ANIMOS, t) ?? t);
}

function withMood(kind: Episode, days: DayLog[]): Crossing | null {
  const tagged = days.filter((d) => tagsOf(d).length > 0);
  const ep = tagged.filter((d) => had(d, kind));
  const rest = tagged.filter((d) => !had(d, kind));
  if (ep.length < 5 || rest.length < 5) return null;

  let best: { tag: Tag; n: number; lift: number; shareRest: number } | null = null;
  const all = new Set(ep.flatMap(tagsOf));
  for (const tag of all) {
    const n = ep.filter((d) => tagsOf(d).includes(tag)).length;
    const shareRest = rest.filter((d) => tagsOf(d).includes(tag)).length / rest.length;
    const lift = n / ep.length / Math.max(shareRest, 0.05);
    if (n >= 3 && lift >= 1.5 && (!best || lift > best.lift)) {
      best = { tag, n, lift, shareRest };
    }
  }
  if (!best) return null;

  return {
    id: `${kind}-animo`,
    over: [kind, "animo"],
    kind: "patron",
    title: `Los días de ${NOUN[kind]} sueles marcar «${tagLabel(best.tag)}»`,
    detail: `${best.n} de ${ep.length} días con ${NOUN[kind]}, frente al ${pct(best.shareRest)} del resto de días.`,
    basis: ep.length,
  };
}

/* ── PAS + Cookie Monster: ¿van juntos? ───────────────────────── */

function pasAndMonster(days: DayLog[]): Crossing | null {
  const pasDays = days.filter((d) => d.cryEvents?.length);
  if (pasDays.length < 5) return null;
  const both = pasDays.filter((d) => d.angerEvents?.length).length;
  const share = both / pasDays.length;
  if (share >= 0.5) {
    return {
      id: "pas-monstruo",
      over: ["pas", "monstruo"],
      kind: "patron",
      title: "Llorar y enfadarse van juntos",
      detail: `${both} de los ${pasDays.length} días con PAS también hubo Cookie Monster.`,
      basis: pasDays.length,
    };
  }
  if (share <= 0.2 && pasDays.length >= 8) {
    return {
      id: "pas-monstruo",
      over: ["pas", "monstruo"],
      kind: "dato",
      title: "Llorar y enfadarse van por separado",
      detail: `Solo ${both} de los ${pasDays.length} días con PAS hubo también Cookie Monster.`,
      basis: pasDays.length,
    };
  }
  return null;
}

/* ── PAS + Cookie Monster + regla: la semana dura ─────────────── */

function hardWeek(pas: EpisodeReport, monster: EpisodeReport): Crossing | null {
  const a = pas.window;
  const b = monster.window;
  if (!a || !b) return null;
  // Tienen que tocarse o casi: dos ventanas lejanas son dos cosas.
  if (a.from > b.to + 3 || b.from > a.to + 3) return null;
  const from = Math.min(a.from, b.from);
  const to = Math.max(a.to, b.to);
  return {
    id: "semana-dura",
    over: ["pas", "monstruo", "regla"],
    kind: "patron",
    title: `Tu semana dura va del día ${from} al ${to}`,
    detail: `Ahí se juntan los PAS (días ${a.from}–${a.to}) y los enfados (días ${b.from}–${b.to}).`,
    basis: a.count + b.count,
  };
}

/** Los cruces entre lo que está encendido, del más amplio al más concreto. */
export function crossings(
  on: ReadonlySet<Filter>,
  days: DayLog[],
  cycles: Cycle[],
  reports: { pas: EpisodeReport; monster: EpisodeReport },
): Crossing[] {
  const out: (Crossing | null)[] = [];
  const has = (...fs: Filter[]) => fs.every((f) => on.has(f));

  if (has("pas", "monstruo", "regla")) out.push(hardWeek(reports.pas, reports.monster));
  if (has("pas", "monstruo")) out.push(pasAndMonster(days));
  for (const kind of ["pas", "monstruo"] as const) {
    if (!on.has(kind)) continue;
    if (on.has("regla")) out.push(beforePeriod(kind, days, cycles));
    if (on.has("dolor")) out.push(withPain(kind, days));
    if (on.has("animo")) out.push(withMood(kind, days));
  }
  return out.filter((c): c is Crossing => c !== null);
}

/* ── Una sola conclusión ──────────────────────────────────────── */

export interface Conclusion {
  title: string;
  detail: string;
  /** Registros que la sostienen; 0 = no hay base todavía */
  basis: number;
  /** De qué sale: para el antetítulo */
  over: Filter[];
  aviso?: boolean;
}

/**
 * De todo lo que se puede decir con los filtros encendidos, lo que
 * más vale: un aviso médico si lo hay, si no el cruce más amplio, si
 * no el patrón más fuerte de un filtro solo.
 */
export function conclusion(
  on: ReadonlySet<Filter>,
  singles: Insight[],
  crossed: Crossing[],
  reports: { pas: EpisodeReport; monster: EpisodeReport },
): Conclusion {
  const mine = singles.filter((i) => on.has(INSIGHT_FILTER[i.id] ?? "regla"));
  const aviso = mine.find((i) => i.kind === "aviso");
  if (aviso) return { ...aviso, over: [INSIGHT_FILTER[aviso.id] ?? "regla"], aviso: true };

  const cross = crossed.find((c) => c.kind === "patron") ?? crossed[0];
  if (cross) return cross;

  for (const f of FILTERS.map((x) => x.value)) {
    if (!on.has(f)) continue;
    if (f === "pas" || f === "monstruo") {
      const r = f === "pas" ? reports.pas : reports.monster;
      const lead = r.insights[0];
      if (lead) return { ...lead, over: [f] };
      continue;
    }
    const best = mine.find((i) => INSIGHT_FILTER[i.id] === f && i.kind === "patron");
    if (best) return { ...best, over: [f] };
  }
  const dato = mine[0];
  if (dato) return { ...dato, over: [INSIGHT_FILTER[dato.id] ?? "regla"] };

  if (on.size === 0) {
    return { title: "Enciende algún filtro", detail: "Elige arriba qué quieres ver.", basis: 0, over: [] };
  }
  const total = (on.has("pas") ? reports.pas.total : 0) + (on.has("monstruo") ? reports.monster.total : 0);
  return {
    title: "Todavía no veo nada claro",
    detail:
      total > 0
        ? `Llevas ${total} registros de esto. Con unos cuantos más, repartidos en al menos tres ciclos, te digo qué se repite.`
        : "Sigue apuntando: cuando algo se repita en varios ciclos, te lo digo aquí.",
    basis: 0,
    over: [...on],
  };
}
