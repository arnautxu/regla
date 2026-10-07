"use client";

import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { fromKey, toKey, type DayLog } from "@/lib/db";
import { phaseByDay } from "@/lib/cycle";
import type { CycleSummary } from "@/lib/history";
import { bled } from "@/lib/period-days";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   CICLO A CICLO, COMO BARRAS

   Una fila por ciclo, un cuadradito por día, todas alineadas por el
   día 1. Así lo que se repite se ve como una columna: si siempre
   llora el día 25, ahí hay una fila de puntos uno encima de otro.

     regla registrada → rojo pleno (hecho)
     ventana fértil   → rosa tenue (estimación: se calcula, no se ve)
     llanto o dolor   → punto encima del día
     ciclo en curso   → lo que falta, apagado, y la regla prevista
                        con trazo discontinuo, como en el anillo
   ═══════════════════════════════════════════════════════════════ */

type Cell =
  | { kind: "period" }
  | { kind: "fertile" }
  | { kind: "plain" }
  | { kind: "future" }
  | { kind: "predicted" }
  | { kind: "none" };

export function CycleBars({
  summaries,
  days,
  avgLength,
  periodLength,
  todayKey,
  open,
  onToggle,
  renderDetail,
}: {
  summaries: CycleSummary[];
  days: DayLog[];
  avgLength: number;
  periodLength: number;
  todayKey: string;
  open: string | null;
  onToggle: (id: string) => void;
  renderDetail: (s: CycleSummary) => React.ReactNode;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));

  const lengthOf = (s: CycleSummary) =>
    s.cycleLength ??
    Math.max(
      avgLength + 2,
      Math.round(
        (fromKey(todayKey).getTime() - fromKey(s.startKey).getTime()) / 864e5,
      ) + 1,
    );
  const columns = Math.max(...summaries.map(lengthOf), avgLength + 2);

  return (
    <ul className="flex flex-col">
      {summaries.map((s) => {
        const len = s.cycleLength ?? avgLength;
        const start = fromKey(s.startKey);
        const elapsed = s.ongoing
          ? Math.round((fromKey(todayKey).getTime() - start.getTime()) / 864e5) + 1
          : len;

        const cells = Array.from({ length: columns }, (_, i) => {
          const d = i + 1;
          const key = toKey(addDays(start, i));
          const log = byDate.get(key);
          let cell: Cell;
          if (!s.ongoing && d > len) cell = { kind: "none" };
          else if (s.ongoing && d > elapsed) {
            cell =
              d > avgLength && d <= avgLength + 2
                ? { kind: "predicted" }
                : d <= avgLength
                  ? { kind: "future" }
                  : { kind: "none" };
          } else if (bled(log)) cell = { kind: "period" };
          else if (phaseByDay(d, len, periodLength) === "ovulacion") cell = { kind: "fertile" };
          else cell = { kind: "plain" };
          const mark =
            d <= elapsed &&
            (!!log?.cryEvents?.length || log?.badDay || (log?.painLevel ?? 0) >= 7);
          return { d, cell, mark, today: s.ongoing && d === elapsed };
        });

        const expanded = open === s.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                haptic(8);
                onToggle(s.id);
              }}
              className="grid min-h-[46px] w-full grid-cols-[62px_1fr] items-center gap-2 text-left"
            >
              <span className="leading-tight">
                <span className="block text-sm font-semibold">
                  {capitalize(format(start, "MMM", { locale: es }).replace(".", ""))}
                  <span className="ml-1 font-normal text-faint">{format(start, "d")}</span>
                </span>
                <span className="block text-2xs text-faint">
                  {s.ongoing ? `día ${elapsed}` : `${len} días`}
                </span>
              </span>
              <span className="flex h-6 gap-[2px]" aria-hidden="true">
                {cells.map(({ d, cell, mark, today }) => (
                  <span
                    key={d}
                    className="relative flex-1 rounded-[3px]"
                    style={cellStyle(cell, today)}
                  >
                    {mark && (
                      <span
                        className="absolute -top-[7px] left-1/2 size-[6px] -translate-x-1/2 rounded-full"
                        style={{
                          background: "var(--ph-lutea)",
                          boxShadow: "0 0 0 1.5px var(--bg)",
                        }}
                      />
                    )}
                  </span>
                ))}
              </span>
              <span className="sr-only">
                {s.ongoing ? "Ciclo en curso" : `Ciclo de ${len} días`}
                {s.periodLength ? `, ${s.periodLength} de regla` : ""}
              </span>
            </button>
            {expanded && (
              <div className="mb-sm ml-[70px] rounded-2xl px-md py-sm flat" style={{ background: "var(--surface)" }}>
                {renderDetail(s)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function cellStyle(cell: Cell, today: boolean): React.CSSProperties {
  const ring = today ? { outline: "2px solid var(--fg)", outlineOffset: "1px" } : {};
  switch (cell.kind) {
    case "period":
      return { background: "var(--ph-menstrual)", ...ring };
    case "fertile":
      return { background: "var(--ph-ovulacion)", opacity: 0.5, ...ring };
    case "plain":
      return { background: "var(--border)", ...ring };
    case "future":
      return { background: "var(--border)", opacity: 0.4 };
    case "predicted":
      return { border: "1.5px dashed var(--ph-menstrual)" };
    case "none":
      return { background: "transparent" };
  }
}

export function CycleBarsLegend() {
  const item = (style: React.CSSProperties, label: string, round = false) => (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={round ? "size-2 rounded-full" : "size-2.5 rounded-[3px]"}
        style={style}
      />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-md gap-y-1 text-2xs text-muted">
      {item({ background: "var(--ph-menstrual)" }, "Regla")}
      {item({ background: "var(--ph-ovulacion)", opacity: 0.5 }, "Fértil (estimada)")}
      {item({ background: "var(--ph-lutea)" }, "Lloró o mucho dolor", true)}
      {item({ border: "1.5px dashed var(--ph-menstrual)" }, "Prevista")}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
