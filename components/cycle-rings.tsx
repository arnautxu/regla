"use client";

import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { fromKey, toKey, type DayLog } from "@/lib/db";
import { phaseByDay } from "@/lib/cycle";
import type { Filter } from "@/lib/crossings";
import type { CycleSummary } from "@/lib/history";
import { bled } from "@/lib/period-days";
import { haptic } from "@/lib/use-lilaila";
import { LilitaFace, type FaceMood } from "./lilita-face";

/* ═══════════════════════════════════════════════════════════════
   CICLO A CICLO, COMO ANILLOS

   Los ciclos como los anillos de un tronco: el de fuera es el de
   ahora y cada aro hacia dentro es uno anterior. Todos empiezan arriba
   en el día 1 y comparten escala, así que un mismo día del ciclo cae
   siempre en el mismo ángulo: lo que se repite se ve como un radio,
   una línea de marcas de fuera hacia dentro.

   Lo que se pinta depende de los filtros: la regla tiñe las cuentas;
   PAS, Cookie Monster, dolor y ánimo ponen una marca encima del día.
   Arriba queda un hueco para el nombre del mes de cada aro.
   ═══════════════════════════════════════════════════════════════ */

const SIZE = 300;
const C = SIZE / 2;
const OUTER = 138;
const STEP = 17;
const WIDTH = 12;
/** Hueco arriba para las etiquetas, en grados */
const GAP_DEG = 34;

type Mark = "pas" | "monstruo" | "dolor" | "animo";

const MARK_ORDER: Mark[] = ["pas", "monstruo", "dolor", "animo"];

function markOf(log: DayLog | undefined, show: ReadonlySet<Filter>): Mark | null {
  if (!log) return null;
  for (const m of MARK_ORDER) {
    if (!show.has(m)) continue;
    if (m === "pas" && log.cryEvents?.length) return m;
    if (m === "monstruo" && log.angerEvents?.length) return m;
    if (m === "dolor" && (log.painLevel ?? 0) >= 7) return m;
    if (m === "animo" && (log.badDay || log.mood?.some((t) => t === "irritada" || t === "llorona" || t === "gremlin")))
      return m;
  }
  return null;
}

export function CycleRings({
  summaries,
  days,
  avgLength,
  periodLength,
  todayKey,
  show,
  face,
  open,
  onToggle,
}: {
  /** Del más reciente al más antiguo */
  summaries: CycleSummary[];
  days: DayLog[];
  avgLength: number;
  periodLength: number;
  todayKey: string;
  show: ReadonlySet<Filter>;
  /** La cara del centro, según lo que se esté concluyendo */
  face: FaceMood;
  open: string | null;
  onToggle: (id: string | null) => void;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const rings = summaries.slice(0, Math.floor((OUTER - 46) / STEP) + 1);

  const elapsedOf = (s: CycleSummary) =>
    Math.round((fromKey(todayKey).getTime() - fromKey(s.startKey).getTime()) / 864e5) + 1;
  const columns = Math.max(
    avgLength + 2,
    ...rings.map((s) => s.cycleLength ?? Math.max(avgLength, elapsedOf(s))),
  );

  const span = ((360 - GAP_DEG) * Math.PI) / 180;
  const a0 = -Math.PI / 2 + ((GAP_DEG / 2) * Math.PI) / 180;
  const angle = (d: number) => a0 + (d / columns) * span;
  const gap = (r: number) => 1 / r;
  const at = (a: number, r: number) => [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  const arc = (from: number, to: number, r: number) => {
    const [x0, y0] = at(from, r);
    const [x1, y1] = at(to, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  /* Tocar un aro lo elige; tocar fuera o el centro, lo suelta. */
  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = SIZE / rect.width;
    const dist = Math.hypot((e.clientX - rect.left) * k - C, (e.clientY - rect.top) * k - C);
    const i = Math.round((OUTER - dist) / STEP);
    const hit = i >= 0 && i < rings.length && Math.abs(OUTER - i * STEP - dist) <= STEP / 2;
    haptic(8);
    onToggle(hit ? (open === rings[i].id ? null : rings[i].id) : null);
  }

  const inner = OUTER - (rings.length - 1) * STEP - WIDTH / 2 - 6;

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block w-full touch-manipulation select-none"
        role="img"
        aria-label={`${rings.length} ciclos, el de fuera es el actual`}
        onPointerDown={pick}
      >
        {rings.map((s, i) => {
          const r = OUTER - i * STEP;
          const len = s.cycleLength ?? avgLength;
          const elapsed = s.ongoing ? elapsedOf(s) : len;
          const last = s.ongoing ? Math.max(avgLength, elapsed) : len;
          const start = fromKey(s.startKey);
          const dim = open !== null && open !== s.id;
          return (
            <g key={s.id} opacity={dim ? 0.3 : 1} className="transition-opacity duration-200">
              {Array.from({ length: Math.min(last, columns) }, (_, j) => {
                const d = j + 1;
                const log = byDate.get(toKey(addDays(start, j)));
                const future = s.ongoing && d > elapsed;
                const period = show.has("regla") && !future && bled(log);
                const fertile =
                  show.has("regla") && !future && !period && phaseByDay(d, len, periodLength) === "ovulacion";
                const mark = future ? null : markOf(log, show);
                const [mx, my] = at(angle(d - 0.5), r);
                return (
                  <g key={d}>
                    <path
                      d={arc(angle(d - 1) + gap(r), angle(d) - gap(r), r)}
                      fill="none"
                      strokeWidth={WIDTH}
                      stroke={
                        period ? "var(--ph-menstrual)" : fertile ? "var(--ph-ovulacion)" : "color-mix(in oklch, var(--fg) 14%, var(--bg))"
                      }
                      opacity={future ? 0.4 : fertile ? 0.5 : 1}
                    />
                    {mark && <MarkDot kind={mark} x={mx} y={my} />}
                  </g>
                );
              })}
              {/* Hoy: una rayita por fuera del aro */}
              {s.ongoing && (() => {
                const [x0, y0] = at(angle(elapsed - 0.5), r + WIDTH / 2 + 1.5);
                const [x1, y1] = at(angle(elapsed - 0.5), r + WIDTH / 2 + 6);
                return <path d={`M${x0} ${y0} L${x1} ${y1}`} stroke="var(--fg)" strokeWidth="2.5" strokeLinecap="round" />;
              })()}
              <text
                x={C}
                y={C - r + 3.5}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight={open === s.id ? 700 : 600}
                fill={open === s.id ? "var(--fg)" : "var(--fg-faint)"}
                className="tnum"
              >
                {format(start, "MMM", { locale: es }).replace(".", "")}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <LilitaFace mood={face} size={Math.max(56, Math.round(inner * 2 * 0.86))} />
      </div>
    </div>
  );
}

function MarkDot({ kind, x, y }: { kind: Mark; x: number; y: number }) {
  switch (kind) {
    case "pas":
      return (
        <path
          d={`M${x} ${y - 4.4} C${x + 3.4} ${y - 0.4},${x + 3} ${y + 3.4},${x} ${y + 3.4} C${x - 3} ${y + 3.4},${x - 3.4} ${y - 0.4},${x} ${y - 4.4}Z`}
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth="1.4"
        />
      );
    case "monstruo":
      return <circle cx={x} cy={y} r="3.6" fill="var(--cookie)" stroke="var(--surface)" strokeWidth="1.3" />;
    case "dolor":
      return <rect x={x - 3} y={y - 3} width="6" height="6" rx="1" fill="var(--fg)" />;
    case "animo":
      return <circle cx={x} cy={y} r="2.8" fill="var(--ph-lutea)" stroke="var(--surface)" strokeWidth="1.2" />;
  }
}

/** Leyenda de lo que está encendido. */
export function CycleRingsLegend({ show }: { show: ReadonlySet<Filter> }) {
  const items: [Filter, React.ReactNode, string][] = [
    ["regla", <span key="r" className="size-2.5 rounded-[3px]" style={{ background: "var(--ph-menstrual)" }} />, "Regla"],
    ["pas", <svg key="p" viewBox="-6 -6 12 12" className="size-3"><MarkDot kind="pas" x={0} y={0} /></svg>, "PAS"],
    ["monstruo", <svg key="m" viewBox="-6 -6 12 12" className="size-3"><MarkDot kind="monstruo" x={0} y={0} /></svg>, "Cookie Monster"],
    ["dolor", <svg key="d" viewBox="-6 -6 12 12" className="size-3"><MarkDot kind="dolor" x={0} y={0} /></svg>, "Dolor 7 o más"],
    ["animo", <svg key="a" viewBox="-6 -6 12 12" className="size-3"><MarkDot kind="animo" x={0} y={0} /></svg>, "Mal día"],
  ];
  const on = items.filter(([f]) => show.has(f));
  if (!on.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-md gap-y-1 text-2xs text-muted" aria-hidden="true">
      {on.map(([f, icon, label]) => (
        <span key={f} className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      ))}
    </div>
  );
}
