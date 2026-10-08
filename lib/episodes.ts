import { conPareja, nombrePareja } from "./pareja";
import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type DayLog, type MonsterReplyKind, type Settings } from "./db";
import { buildModel } from "./predict";
import { phaseByDay, type Phase } from "./cycle";
import { withCycleDay, type Insight } from "./insights";

/* ═══════════════════════════════════════════════════════════════
   PAS Y COOKIE MONSTER, LEÍDOS COMO LA REGLA

   Los llantos (PAS) y los enfados con Arnau (Cookie Monster) se
   cruzan con el día del ciclo igual que el dolor o los síntomas:
   en qué días se juntan, en qué fase, a qué hora y, en los enfados,
   cuánto duran y qué los arregla antes.

   Mismas reglas que insights.ts:

   · NADA SIN BASE. Cada cifra dice sobre cuántos registros se apoya
     y no aparece por debajo de un mínimo.

   · TODO EN EL MÓVIL. Esto no se manda a ningún sitio. El PAS es lo
     más íntimo que guarda la app y no entra en el chat ni en la voz.
   ═══════════════════════════════════════════════════════════════ */

export type EpisodeKind = "pas" | "monstruo";

export type HourBucket = "madrugada" | "manana" | "tarde" | "noche";

export const HOUR_LABEL: Record<HourBucket, string> = {
  madrugada: "Madrugada",
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
};

/** Una ventana del ciclo donde se juntan los episodios. */
export interface EpisodeWindow {
  /** Días del ciclo, ambos incluidos */
  from: number;
  to: number;
  /** Episodios dentro */
  count: number;
  /** Del total */
  total: number;
  /** Ciclos distintos con algún episodio dentro */
  cycles: number;
}

export interface PhaseRate {
  phase: Phase;
  count: number;
  /** Días vividos en esa fase en el periodo analizado */
  days: number;
  /** Episodios por cada 10 días de fase */
  per10: number;
}

export interface EpisodeReport {
  kind: EpisodeKind;
  total: number;
  /** Ciclos con al menos un episodio */
  cycles: number;
  /** Episodios por día del ciclo, índice 0 = día 1 */
  byCycleDay: number[];
  window?: EpisodeWindow;
  phaseRates?: PhaseRate[];
  hours?: Record<HourBucket, number>;
  /** Solo enfados: duración media en minutos */
  duration?: { avg: number; closed: number; inWindow?: number; outWindow?: number };
  /** Solo enfados: cuánto dura según la primera respuesta de Arnau */
  replies?: { kind: MonsterReplyKind; avg: number; n: number }[];
  insights: Insight[];
}

interface Hit {
  at: Date;
  cycleDay: number;
  cycleId: string;
  /** Solo enfados */
  endedAt?: Date;
  date: string;
}

/* ── Mínimos ──────────────────────────────────────────────────── */

const MIN_PATTERN = 6;
const MIN_WINDOW_CYCLES = 3;
/** Parte del total que tiene que caer en la ventana para decir «se juntan» */
const MIN_WINDOW_SHARE = 0.45;
const WINDOW_SPAN = 7;
const MIN_DURATIONS = 5;
const MIN_PER_REPLY = 3;

function hitsOf(kind: EpisodeKind, days: DayLog[], cycles: Cycle[]): Hit[] {
  const out: Hit[] = [];
  for (const { log, cycleDay, cycleId } of withCycleDay(days, cycles)) {
    const events = kind === "pas" ? log.cryEvents : log.angerEvents;
    for (const e of events ?? []) {
      out.push({
        at: new Date(e.at),
        cycleDay,
        cycleId,
        date: log.date,
        endedAt:
          "endedAt" in e && e.endedAt ? new Date(e.endedAt) : undefined,
      });
    }
  }
  return out;
}

export function hourBucket(d: Date): HourBucket {
  const h = d.getHours();
  if (h < 6) return "madrugada";
  if (h < 14) return "manana";
  if (h < 20) return "tarde";
  return "noche";
}

/** Los 7 días seguidos del ciclo con más episodios, recortados por los bordes vacíos. */
function bestWindow(hits: Hit[], length: number): EpisodeWindow | undefined {
  if (hits.length < MIN_PATTERN) return undefined;
  let best: EpisodeWindow | undefined;
  for (let from = 1; from + WINDOW_SPAN - 1 <= length; from++) {
    const to = from + WINDOW_SPAN - 1;
    const inside = hits.filter((h) => h.cycleDay >= from && h.cycleDay <= to);
    if (!best || inside.length > best.count) {
      best = {
        from,
        to,
        count: inside.length,
        total: hits.length,
        cycles: new Set(inside.map((h) => h.cycleId)).size,
      };
    }
  }
  if (!best) return undefined;
  if (best.cycles < MIN_WINDOW_CYCLES) return undefined;
  if (best.count / best.total < MIN_WINDOW_SHARE) return undefined;

  // Se recorta a los días que de verdad tienen algo: una ventana de
  // siete con los dos primeros vacíos anuncia una zona que no existe.
  const days = hits
    .filter((h) => h.cycleDay >= best!.from && h.cycleDay <= best!.to)
    .map((h) => h.cycleDay);
  return { ...best, from: Math.min(...days), to: Math.max(...days) };
}

/** Cuántos días se han vivido en cada fase, desde el primer ciclo hasta hoy. */
function phaseDays(cycles: Cycle[], length: number, periodLength: number, todayKey: string) {
  const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const count: Record<Phase, number> = { menstrual: 0, folicular: 0, ovulacion: 0, lutea: 0 };
  sorted.forEach((c, i) => {
    const next = sorted[i + 1]?.startDate ?? todayKey;
    const span = differenceInCalendarDays(fromKey(next), fromKey(c.startDate)) + (sorted[i + 1] ? 0 : 1);
    for (let d = 1; d <= Math.min(span, 45); d++) {
      count[phaseByDay(Math.min(d, length), length, periodLength)]++;
    }
  });
  return count;
}

const PHASE_WORD: Record<Phase, string> = {
  menstrual: "con la regla",
  folicular: "en la folicular",
  ovulacion: "en los días fértiles",
  lutea: "en la lútea",
};

function minutes(n: number): string {
  const m = Math.round(n);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export { minutes as formatMinutes };

export function episodeReport(
  kind: EpisodeKind,
  days: DayLog[],
  cycles: Cycle[],
  settings: Settings,
  todayKey: string,
): EpisodeReport {
  const model = buildModel(cycles, settings);
  const length = model.length;
  const hits = hitsOf(kind, days, cycles);
  const total = hits.length;
  const byCycleDay = Array.from({ length }, () => 0);
  for (const h of hits) byCycleDay[Math.min(h.cycleDay, length) - 1]++;

  const report: EpisodeReport = {
    kind,
    total,
    cycles: new Set(hits.map((h) => h.cycleId)).size,
    byCycleDay,
    insights: [],
  };
  if (total === 0) return report;

  const noun = kind === "pas" ? "PAS" : "enfados";
  const insights: Insight[] = [];

  /* La ventana: dónde se juntan. */
  const window = bestWindow(hits, length);
  report.window = window;
  if (window) {
    insights.push({
      id: `${kind}-ventana`,
      kind: "patron",
      title:
        kind === "pas"
          ? `Tus PAS se juntan entre el día ${window.from} y el ${window.to}`
          : `Los enfados se juntan entre el día ${window.from} y el ${window.to}`,
      detail: `${window.count} de ${window.total} ${noun} cayeron ahí, en ${window.cycles} ciclos distintos. ${
        kind === "pas"
          ? "Es tu semana sensible: si lloras esos días, no es que estés rara."
          : "Es tu zona monstruo: que {pareja} vaya con cuidado esos días."
      }`,
      basis: window.total,
    });
  }

  /* Por fase, con la tasa por cada 10 días de fase: si no, la lútea
     (la más larga) ganaría siempre por pura duración. */
  if (total >= MIN_PATTERN && model.confidence !== "ninguna") {
    const lived = phaseDays(cycles, length, model.periodLength, todayKey);
    const counts: Record<Phase, number> = { menstrual: 0, folicular: 0, ovulacion: 0, lutea: 0 };
    for (const h of hits) counts[phaseByDay(Math.min(h.cycleDay, length), length, model.periodLength)]++;
    const rates = (Object.keys(counts) as Phase[])
      .filter((p) => lived[p] > 0)
      .map((phase) => ({
        phase,
        count: counts[phase],
        days: lived[phase],
        per10: (counts[phase] / lived[phase]) * 10,
      }));
    report.phaseRates = rates;
    const top = rates.reduce((a, b) => (b.per10 > a.per10 ? b : a));
    const rest = rates.filter((r) => r.phase !== top.phase);
    const restRate =
      rest.reduce((a, r) => a + r.count, 0) / Math.max(1, rest.reduce((a, r) => a + r.days, 0)) * 10;
    if (top.count >= 3 && top.per10 >= restRate * 1.8) {
      const times = restRate > 0 ? Math.round(top.per10 / restRate) : undefined;
      insights.push({
        id: `${kind}-fase`,
        kind: "patron",
        title: `${kind === "pas" ? "Lloras" : "Te enfadas"} más ${PHASE_WORD[top.phase]}`,
        detail: times && times >= 2
          ? `Contando cuántos días dura cada fase, ahí pasa unas ${times} veces más que en el resto del ciclo.`
          : `Contando cuántos días dura cada fase, es donde más se repite.`,
        basis: total,
      });
    }
  }

  /* La hora. */
  if (total >= MIN_PATTERN) {
    const hours: Record<HourBucket, number> = { madrugada: 0, manana: 0, tarde: 0, noche: 0 };
    for (const h of hits) hours[hourBucket(h.at)]++;
    report.hours = hours;
    const [bucket, n] = (Object.entries(hours) as [HourBucket, number][]).reduce((a, b) =>
      b[1] > a[1] ? b : a,
    );
    if (n / total >= 0.5) {
      insights.push({
        id: `${kind}-hora`,
        kind: "patron",
        title:
          bucket === "noche"
            ? `${kind === "pas" ? "Los PAS" : "Los enfados"} llegan de noche`
            : `${kind === "pas" ? "Los PAS" : "Los enfados"} llegan sobre todo por la ${HOUR_LABEL[bucket].toLowerCase()}`,
        detail: `${n} de ${total} fueron ${bucket === "noche" ? "a partir de las ocho" : bucket === "tarde" ? "entre las dos y las ocho" : bucket === "manana" ? "antes de las dos" : "antes de las seis de la mañana"}.`,
        basis: total,
      });
    }
  }

  /* Enfados: cuánto duran y qué los arregla. */
  if (kind === "monstruo") {
    const closed = hits.filter((h) => h.endedAt && h.endedAt > h.at);
    const mins = (h: Hit) => (h.endedAt!.getTime() - h.at.getTime()) / 60000;
    if (closed.length >= MIN_DURATIONS) {
      const avg = closed.reduce((a, h) => a + mins(h), 0) / closed.length;
      const inside = window ? closed.filter((h) => h.cycleDay >= window.from && h.cycleDay <= window.to) : [];
      const outside = window ? closed.filter((h) => h.cycleDay < window.from || h.cycleDay > window.to) : [];
      report.duration = {
        avg,
        closed: closed.length,
        inWindow: inside.length >= 3 ? inside.reduce((a, h) => a + mins(h), 0) / inside.length : undefined,
        outWindow: outside.length >= 3 ? outside.reduce((a, h) => a + mins(h), 0) / outside.length : undefined,
      };
      const { inWindow, outWindow } = report.duration;
      insights.push({
        id: "monstruo-duracion",
        kind: "dato",
        title: `Un enfado dura ${minutes(avg)} de media`,
        detail:
          inWindow && outWindow && inWindow > outWindow * 1.4
            ? `En la zona monstruo, ${minutes(inWindow)}. Fuera, ${minutes(outWindow)}.`
            : `Contando solo los que cerraste con «se me ha pasado».`,
        basis: closed.length,
      });

      // La primera respuesta de Arnau dentro del enfado.
      const replies = days.flatMap((d) =>
        (d.monsterReplies ?? []).map((r) => ({ ...r, t: new Date(r.at).getTime() })),
      );
      const byKind = new Map<MonsterReplyKind, number[]>();
      for (const h of closed) {
        const first = replies
          .filter((r) => r.t >= h.at.getTime() && r.t <= h.endedAt!.getTime())
          .sort((a, b) => a.t - b.t)[0];
        if (!first) continue;
        const arr = byKind.get(first.kind) ?? [];
        arr.push(mins(h));
        byKind.set(first.kind, arr);
      }
      const scored = [...byKind.entries()]
        .filter(([, v]) => v.length >= MIN_PER_REPLY)
        .map(([k, v]) => ({ kind: k, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }))
        .sort((a, b) => a.avg - b.avg);
      if (scored.length >= 2) {
        report.replies = scored;
        const best = scored[0];
        const worst = scored[scored.length - 1];
        if (worst.avg > best.avg * 1.3) {
          insights.push({
            id: "monstruo-respuesta",
            kind: "patron",
            title: `${REPLY_TITLE[best.kind]} lo arregla antes`,
            detail: `Con ${REPLY_WORD[best.kind]} de {pareja} se pasa en ${minutes(best.avg)}. Con ${REPLY_WORD[worst.kind]}, en ${minutes(worst.avg)}.`,
            basis: scored.reduce((a, s) => a + s.n, 0),
          });
        }
      }
    }
  }

  const pareja = nombrePareja(settings) ?? "tu pareja";
  report.insights = insights.map((i) => ({
    ...i,
    title: conPareja(i.title, pareja),
    detail: conPareja(i.detail, pareja),
  }));
  return report;
}

const REPLY_TITLE: Record<MonsterReplyKind, string> = {
  animos: "Que te mande ánimos",
  pulla: "Una pulla",
  mensaje: "Un mensaje suyo",
};

const REPLY_WORD: Record<MonsterReplyKind, string> = {
  animos: "ánimos",
  pulla: "una pulla",
  mensaje: "un mensaje",
};

/** ¿Cae este día del ciclo dentro de la ventana? */
export function inWindow(w: EpisodeWindow | undefined, cycleDay: number | undefined): boolean {
  return !!w && cycleDay !== undefined && cycleDay >= w.from && cycleDay <= w.to;
}
