"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Lilita } from "@/components/lilita";
import { CycleBars, CycleBarsLegend } from "@/components/cycle-bars";
import { InsightList } from "@/components/insight-list";
import { computeStats, summarizeCycles } from "@/lib/history";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { db } from "@/lib/db";
import type { CycleSummary } from "@/lib/history";
import { useLilaila } from "@/lib/use-lilaila";

export default function Historial() {
  const { ready, settings, cycles, dateKey, state } = useLilaila();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
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

  const detail = (s: CycleSummary) => (
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
      <Fact
        label="PAS · Llantos"
        value={s.cryEvents > 0 ? String(s.cryEvents) : "Ninguno"}
      />
      {s.notes.length > 0 && (
        <div className="col-span-2">
          <dt className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
            Notas
          </dt>
          <dd className="mt-1 space-y-1 text-sm">
            {s.notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );

  // Con más de seis ciclos las barras se hacen una pared; los
  // recientes son los que cuentan y el resto queda a un toque.
  const visible = all ? summaries : summaries.slice(0, 6);
  const [featured, ...rest] = insights;

  return (
    <div className="flex flex-1 flex-col gap-lg px-safe pt-safe pb-lg">
      <div className="flex items-center gap-2 pt-lg">
        <Lilita mood="neutral" size={38} className="shrink-0" />
        <h1 className="font-display text-xl font-bold tracking-[-0.03em]">
          Historial
        </h1>
      </div>

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
          {/* Tres cifras en una tira, no cuatro pegatinas: son
              contexto, no el protagonista. El protagonista son los
              ciclos dibujados de debajo. */}
          <dl
            className="sticker grid grid-cols-3 rounded-[20px] py-md"
            style={{ background: "var(--surface)" }}
          >
            <Stat
              label="ciclo medio"
              value={stats.avgCycle ? `${stats.avgCycle}` : "—"}
            />
            <Stat
              label="días de regla"
              value={stats.avgPeriod ? `${stats.avgPeriod}` : "—"}
            />
            {/* Un veredicto de regularidad con dos o tres ciclos es
                estadística de barra. Hasta cuatro medidas no se dice
                nada, y aun así se enseña el margen. */}
            <Stat
              label={
                stats.spread === undefined || stats.basis < 4
                  ? stats.shortest && stats.longest
                    ? `pocos datos`
                    : "regularidad"
                  : stats.spread <= 2
                    ? "muy regular"
                    : stats.spread <= 4
                      ? "regular"
                      : "caótica"
              }
              value={
                stats.spread !== undefined && stats.basis >= 4
                  ? `±${stats.spread}`
                  : stats.shortest && stats.longest
                    ? `${stats.shortest}–${stats.longest}`
                    : "—"
              }
              small={!(stats.spread !== undefined && stats.basis >= 4)}
            />
          </dl>

          {stats.avgCycle === undefined ? (
            <p className="-mt-md text-sm leading-relaxed text-muted">
              Con un solo ciclo no puedo calcular medias. Necesito al menos dos
              para saber cuánto tarda en volver.
            </p>
          ) : (
            stats.basis < 6 && (
              <p className="-mt-md text-xs leading-relaxed text-faint">
                Estas cifras todavía se mueven bastante. Con medio año de
                registro empiezan a significar algo.
              </p>
            )
          )}

          <section className="flex flex-col gap-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
                Ciclo a ciclo
              </h2>
              <p className="text-2xs text-faint">Toca uno para verlo</p>
            </div>
            <CycleBars
              summaries={visible}
              days={days ?? []}
              avgLength={state.avgLength}
              periodLength={state.model.periodLength}
              todayKey={dateKey}
              open={open}
              onToggle={(id) => setOpen((o) => (o === id ? null : id))}
              renderDetail={detail}
            />
            <CycleBarsLegend />
            {summaries.length > 6 && (
              <button
                type="button"
                onClick={() => setAll((v) => !v)}
                className="self-start py-1 text-sm font-semibold"
                style={{ color: "var(--accent)" }}
              >
                {all ? "Ver solo los recientes" : `Ver los ${summaries.length} ciclos`}
              </button>
            )}
          </section>

          {featured && (
            <section className="flex flex-col gap-sm">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
                Lo que veo
              </h2>
              {/* El patrón más fuerte, con Lilita, que es quien lo dice.
                  El resto, debajo y en plano. */}
              <article
                className="sticker flex gap-3 rounded-[20px] px-md py-md"
                style={{
                  background: featured.kind === "aviso" ? "var(--accent-soft)" : "var(--ph-menstrual-bg)",
                }}
              >
                <Lilita mood={featured.kind === "aviso" ? "cuidando" : "neutral"} size={40} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--ph-menstrual)" }}>
                    {featured.kind === "aviso" ? "Coméntalo con un médico" : featured.kind === "patron" ? "Tu patrón" : "Dato"}
                  </p>
                  <h3 className="mt-1 font-display text-base font-bold leading-tight tracking-[-0.015em]">
                    {featured.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{featured.detail}</p>
                  {featured.kind !== "dato" && (
                    <p className="mt-1 text-xs text-faint">
                      Sobre {featured.basis} {featured.basis === 1 ? "registro" : "registros"}
                    </p>
                  )}
                </div>
              </article>
              {rest.length > 0 && <InsightList insights={rest} />}
            </section>
          )}

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
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col items-center border-r border-line px-1 text-center last:border-r-0">
      <dd
        className={`tnum font-display font-extrabold leading-none tracking-[-0.03em] ${small ? "text-lg leading-[1.75rem]" : "text-[28px]"}`}
      >
        {value}
      </dd>
      <dt className="mt-1 text-2xs text-muted">{label}</dt>
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
