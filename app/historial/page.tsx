"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Lilita } from "@/components/lilita";
import { CycleRings, CycleRingsLegend } from "@/components/cycle-rings";
import type { FaceMood } from "@/components/lilita-face";
import { episodeReport } from "@/lib/episodes";
import {
  FILTERS,
  FILTER_LABEL,
  conclusion,
  crossings,
  type Filter,
} from "@/lib/crossings";
import { computeStats, summarizeCycles } from "@/lib/history";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { db, fromKey } from "@/lib/db";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { CycleSummary } from "@/lib/history";
import { haptic, useLilaila } from "@/lib/use-lilaila";

export default function Historial() {
  const { ready, settings, cycles, dateKey, state } = useLilaila();
  const [open, setOpen] = useState<string | null>(null);
  const on = useFilters();
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

  // PAS y enfados, leídos igual que la regla. Todo en el móvil.
  const episodes = useMemo(() => {
    const all = days ?? [];
    return {
      pas: episodeReport("pas", all, cycles, settings, dateKey),
      monster: episodeReport("monstruo", all, cycles, settings, dateKey),
    };
  }, [cycles, days, settings, dateKey]);

  // Una sola conclusión, la que más vale con lo que está encendido.
  const said = useMemo(
    () => conclusion(on, insights, crossings(on, days ?? [], cycles, episodes), episodes),
    [on, insights, days, cycles, episodes],
  );
  const face: FaceMood = said.aviso
    ? "cuidando"
    : said.over.includes("monstruo")
      ? "enfadada"
      : said.over.includes("pas")
        ? "llorando"
        : said.basis === 0
          ? "neutral"
          : "flirty";

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
      <Fact
        label="Cookie Monster"
        value={s.angerEvents > 0 ? String(s.angerEvents) : "Ninguno"}
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

  const openSummary = summaries.find((s) => s.id === open);

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

          {/* Filtros: qué se pinta en los anillos y de qué se concluye */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Qué enseñar">
            {FILTERS.map((f) => {
              const pressed = on.has(f.value);
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => {
                    haptic(6);
                    toggleFilter(f.value);
                  }}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-shadow"
                  style={{
                    background: "var(--surface)",
                    color: pressed ? "var(--fg)" : "var(--fg-muted)",
                    boxShadow: pressed
                      ? "inset 0 0 0 1.5px var(--fg), 2px 2px 0 0 var(--depth-shadow)"
                      : "inset 0 0 0 1.5px var(--border-strong)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: f.color, opacity: pressed ? 1 : 0.35 }}
                  />
                  {f.label}
                </button>
              );
            })}
          </div>

          <section className="flex flex-col gap-sm">
            <CycleRings
              summaries={summaries}
              days={days ?? []}
              avgLength={state.avgLength}
              periodLength={state.model.periodLength}
              todayKey={dateKey}
              show={on}
              face={face}
              open={open}
              onToggle={setOpen}
            />
            <CycleRingsLegend show={on} />
            {openSummary ? (
              <div className="rounded-2xl px-md py-sm flat" style={{ background: "var(--surface)" }}>
                <p className="mb-2 font-display text-sm font-bold">
                  Ciclo de {format(fromKey(openSummary.startKey), "MMMM", { locale: es })}
                  {openSummary.ongoing && <span className="font-normal text-faint"> · en curso</span>}
                </p>
                {detail(openSummary)}
              </div>
            ) : (
              <p className="text-center text-2xs text-faint">
                Fuera, el ciclo de ahora. Toca un aro para ver ese ciclo.
              </p>
            )}
          </section>

          {/* La conclusión: una, y cambia con los filtros */}
          <article
            aria-live="polite"
            className="sticker rounded-[20px] px-md py-md"
            style={{ background: said.aviso ? "var(--accent-soft)" : "var(--surface)" }}
          >
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
              {said.aviso
                ? "Coméntalo con un médico"
                : said.over.length
                  ? said.over.map((f) => FILTER_LABEL[f]).join(" + ")
                  : "Conclusión"}
            </p>
            <h2 className="mt-1 font-display text-lg font-bold leading-tight tracking-[-0.015em]">
              {said.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{said.detail}</p>
            {said.basis > 0 && (
              <p className="mt-1 text-xs text-faint">
                Sobre {said.basis} {said.basis === 1 ? "registro" : "registros"}
              </p>
            )}
          </article>

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

/* ── Filtros, recordados en este móvil ─────────────────────────── */

const FILTERS_KEY = "lilaila:historial-filtros";
const ALL: Filter[] = FILTERS.map((f) => f.value);
const listeners = new Set<() => void>();
let cached: { raw: string | null; set: ReadonlySet<Filter> } | null = null;

function readFilters(): ReadonlySet<Filter> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FILTERS_KEY);
  } catch {}
  if (cached && cached.raw === raw) return cached.set;
  let set: ReadonlySet<Filter> = new Set(ALL);
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) set = new Set(parsed.filter((f): f is Filter => ALL.includes(f)));
  } catch {}
  cached = { raw, set };
  return set;
}

const SERVER_FILTERS: ReadonlySet<Filter> = new Set(ALL);

function useFilters() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readFilters,
    () => SERVER_FILTERS,
  );
}

function toggleFilter(f: Filter) {
  const next = new Set(readFilters());
  if (next.has(f)) next.delete(f);
  else next.add(f);
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify([...next]));
  } catch {
    cached = { raw: cached?.raw ?? null, set: next };
  }
  listeners.forEach((l) => l());
}
