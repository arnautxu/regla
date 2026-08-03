"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addMonths, format, isSameMonth, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "@/components/lilita";
import { DaySheet } from "@/components/day-sheet";
import { Legend, MonthGrid } from "@/components/month-grid";
import { buildMonth, upcoming, type DayCell } from "@/lib/calendar";
import { dateRange } from "@/lib/format";
import { db } from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";

export default function Calendario() {
  const { ready, settings, cycles, dateKey } = useLilaila();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<DayCell | null>(null);

  const days = useLiveQuery(() => db.days.toArray(), [], []);

  const { weeks, painted } = useMemo(
    () => buildMonth(month, cycles, days ?? [], settings, dateKey),
    [month, cycles, days, settings, dateKey],
  );

  const next = useMemo(
    () => upcoming(cycles, settings, dateKey),
    [cycles, settings, dateKey],
  );

  const isCurrentMonth = isSameMonth(month, new Date());

  return (
    <div className="flex flex-1 flex-col gap-lg px-safe pt-safe pb-lg">
      {/* ── Cabecera con navegación de mes ─────────────────────── */}
      <header className="flex items-center justify-between gap-md pt-lg">
        <h1 className="font-display text-xl font-bold capitalize tracking-[-0.03em]">
          {format(month, "LLLL yyyy", { locale: es })}
        </h1>

        <div className="flex items-center gap-1">
          <MonthButton
            label="Mes anterior"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            d="M14.5 5 L8 12 L14.5 19"
          />
          <MonthButton
            label="Mes siguiente"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            d="M9.5 5 L16 12 L9.5 19"
          />
        </div>
      </header>

      {ready && (
        <>
          <MonthGrid weeks={weeks} onSelect={setSelected} />

          {/* Volver a hoy solo aparece cuando te has ido lejos. Un
              botón que no hace nada el 90% del tiempo es ruido. */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => {
                haptic(8);
                setMonth(startOfMonth(new Date()));
              }}
              className="self-start text-xs underline underline-offset-4"
              style={{ color: "var(--accent)" }}
            >
              Volver a este mes
            </button>
          )}

          {/* Lo que viene casi nunca cae en el mes que estás mirando,
              y es justo lo que has abierto el calendario a consultar. */}
          {next.periodStart && next.startEarliest && next.fertileStart && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-lg gap-y-3 border-t border-line pt-lg text-sm">
              <dt className="text-2xs font-semibold uppercase leading-5 tracking-[0.14em] text-faint">
                Próxima regla
              </dt>
              {/* El margen de INICIO, igual que en Hoy. Antes esto
                  mostraba la duración prevista (21–25) y Hoy mostraba
                  el margen (20–22): mismo formato, dos significados
                  distintos. Se leía como una contradicción. */}
              <dd className="tnum">
                Empieza {dateRange(next.startEarliest, next.startLatest)}
              </dd>

              <dt className="text-2xs font-semibold uppercase leading-5 tracking-[0.14em] text-faint">
                Ventana fértil
              </dt>
              <dd className="tnum">
                {next.fertileNow ? (
                  <span className="text-muted">
                    Ahora mismo, hasta el{" "}
                    {format(next.fertileEnd!, "d", { locale: es })}
                  </span>
                ) : (
                  dateRange(next.fertileStart!, next.fertileEnd)
                )}
              </dd>
            </dl>
          )}

          <div className="border-t border-line pt-lg">
            <Legend />
          </div>

          <p className="text-xs leading-relaxed text-faint">
            Las bandas discontinuas son estimaciones a partir de tus últimos
            ciclos, no promesas. La ventana fértil no sirve como
            anticonceptivo.
          </p>

          {painted === 0 && cycles.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-md pb-xl">
              <Lilita mood="neutral" size={112} />
              <p className="max-w-[28ch] text-center text-sm leading-snug text-muted">
                Este mes está en blanco. Toca cualquier día y dime que fue el
                primero, y empiezo a pintar.
              </p>
            </div>
          )}
        </>
      )}

      <DaySheet day={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function MonthButton({
  label,
  onClick,
  d,
}: {
  label: string;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        haptic(8);
        onClick();
      }}
      className="flex size-11 items-center justify-center rounded-full transition-[transform,background-color] duration-150 active:scale-90"
      style={{ color: "var(--fg-muted)" }}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}
