"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Droplet } from "lucide-react";
import { Lilita } from "@/components/lilita";
import {
  CardSplitAccordion,
  type AccordionItemData,
} from "@/components/ui/card-split-accordion";
import { InsightList } from "@/components/insight-list";
import { computeStats, summarizeCycles } from "@/lib/history";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { db, fromKey } from "@/lib/db";
import { useLilaila } from "@/lib/use-lilaila";

export default function Historial() {
  const { ready, settings, cycles, dateKey } = useLilaila();
  const days = useLiveQuery(() => db.days.toArray(), [], []);

  const summaries = useMemo(
    () => summarizeCycles(cycles, days ?? [], dateKey),
    [cycles, days, dateKey],
  );
  const stats = useMemo(
    () => computeStats(cycles, summaries, settings),
    [cycles, summaries, settings],
  );

  const insights = useMemo(
    () =>
      computeInsights(cycles, days ?? [], settings, dateKey, (d, len) =>
        phaseByDay(d, len, settings.avgPeriodLength),
      ),
    [cycles, days, settings, dateKey],
  );

  const items: AccordionItemData[] = summaries.map((s) => ({
    id: s.id,
    title: capitalize(format(fromKey(s.startKey), "d 'de' MMMM", { locale: es })),
    meta: s.ongoing
      ? "En curso"
      : `${s.cycleLength} días de ciclo${s.periodLength ? ` · ${s.periodLength} de regla` : ""}`,
    icon: <Droplet className="size-4" fill="currentColor" strokeWidth={0} />,
    content: (
      <dl className="grid grid-cols-2 gap-x-md gap-y-3">
        <Fact
          label="Duración del ciclo"
          value={s.cycleLength ? `${s.cycleLength} días` : "Aún corriendo"}
        />
        <Fact
          label="Duración de la regla"
          value={s.periodLength ? `${s.periodLength} días` : "No lo cerraste"}
        />
        <Fact
          label="Dolor máximo"
          value={s.maxPain !== undefined ? `${s.maxPain} de 10` : "Sin registrar"}
        />
        <Fact
          label="Días de mierda"
          value={s.badDays > 0 ? String(s.badDays) : "Ninguno"}
        />
        {s.notes.length > 0 && (
          <div className="col-span-2">
            <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
              Notas
            </dt>
            <dd className="mt-1 space-y-1">
              {s.notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </dd>
          </div>
        )}
      </dl>
    ),
  }));

  return (
    <div className="flex flex-1 flex-col gap-xl px-safe pt-safe pb-lg">
      <h1 className="pt-lg font-display text-xl font-bold tracking-[-0.03em]">
        Historial
      </h1>

      {!ready ? null : cycles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-lg pb-2xl">
          <Lilita mood="neutral" size={124} />
          <p className="max-w-[27ch] text-center font-display text-base leading-snug text-muted">
            Aquí no hay nada porque todavía no me has contado nada. Empieza por
            el botón rojo de la primera pantalla.
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-y-lg border-t border-line pt-lg">
            <Stat
              label="Ciclo medio"
              value={stats.avgCycle ? `${stats.avgCycle}` : "—"}
              unit={stats.avgCycle ? "días" : undefined}
            />
            <Stat
              label="Regla media"
              value={stats.avgPeriod ? `${stats.avgPeriod}` : "—"}
              unit={stats.avgPeriod ? "días" : undefined}
            />
            <Stat
              label="Rango"
              value={
                stats.shortest && stats.longest
                  ? `${stats.shortest}–${stats.longest}`
                  : "—"
              }
              unit={stats.shortest ? "días" : undefined}
            />
            {/* Un veredicto de regularidad con dos o tres ciclos es
                estadística de barra. Hasta cuatro medidas no se dice
                nada, y aun así se enseña el margen al lado. */}
            <Stat
              label="Regularidad"
              value={
                stats.spread === undefined || stats.basis < 4
                  ? "Pocos datos"
                  : stats.spread <= 2
                    ? "Buena"
                    : stats.spread <= 4
                      ? "Normal"
                      : "Caótica"
              }
              unit={
                stats.spread !== undefined && stats.basis >= 4
                  ? `±${stats.spread} ${stats.spread === 1 ? "día" : "días"}`
                  : undefined
              }
            />
          </dl>

          {stats.avgCycle === undefined ? (
            <p className="-mt-md text-sm leading-relaxed text-muted">
              Con un solo ciclo no puedo calcular medias. Necesito al menos dos
              para saber cuánto tarda en volver.
            </p>
          ) : (
            stats.basis < 6 && (
              <p className="-mt-md text-sm leading-relaxed text-muted">
                Estas cifras todavía se mueven bastante. Con medio año de
                registro empiezan a significar algo.
              </p>
            )
          )}

          {insights.length > 0 && (
            <section>
              <h2 className="mb-sm text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
                Lo que veo
              </h2>
              <InsightList insights={insights} />
            </section>
          )}

          <section>
            <h2 className="mb-sm text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
              Ciclo a ciclo
            </h2>
            <CardSplitAccordion items={items} />
          </section>

          <p className="text-xs leading-relaxed text-faint">
            Todo esto sale de tus propios registros y se calcula en este móvil.
            Son patrones, no diagnósticos: Lilaila no es un dispositivo médico.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        {label}
      </dt>
      <dd className="tnum mt-1 font-display text-xl font-bold tracking-[-0.03em]">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
        )}
      </dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        {label}
      </dt>
      <dd className="tnum mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
