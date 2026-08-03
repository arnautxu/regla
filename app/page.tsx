"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { useLiveQuery } from "dexie-react-hooks";
import { Lilita } from "@/components/lilita";
import { FlowRow } from "@/components/flow-row";
import { MoodRow } from "@/components/mood-row";
import { PeriodSheet, type PeriodAction } from "@/components/period-sheet";
import { PHASE_LABEL, phaseByDay, type CycleState } from "@/lib/cycle";
import { buildContext } from "@/lib/ai-context";
import { computeInsights } from "@/lib/insights";
import { useLilitaLine } from "@/lib/use-lilita-line";
import { capitalize, dateRange } from "@/lib/format";
import { db, deleteCycle, endPeriod, fromKey, startPeriod } from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";

export default function Hoy() {
  const {
    ready,
    state,
    today,
    line: fallbackLine,
    dateKey,
    cycles,
    settings,
  } = useLilaila();

  const days = useLiveQuery(() => db.days.toArray(), [], []);

  const context = useMemo(() => {
    const insights = computeInsights(
      cycles,
      days ?? [],
      settings,
      dateKey,
      (d, len) => phaseByDay(d, len, settings.avgPeriodLength),
    );
    return buildContext(state, today, settings.humorLevel, insights);
  }, [state, today, settings, cycles, days, dateKey]);

  // El banco local se pinta ya; si el modelo contesta, lo sustituye.
  const { line } = useLilitaLine(fallbackLine, context, dateKey, ready);

  const [asking, setAsking] = useState<PeriodAction | null>(null);

  // Antes de que IndexedDB conteste no pintamos números: un "día 1"
  // fantasma que salta a "día 14" es peor que medio segundo en blanco.
  if (!ready) return <Booting />;

  const bleeding = state.bleeding;
  const latest = cycles[cycles.length - 1];
  // El deshacer vale durante toda la regla en curso: darse cuenta
  // del dedazo al dia siguiente es lo normal.
  const canUndo = bleeding || latest?.startDate === dateKey;

  return (
    <div className="flex flex-1 flex-col gap-md px-safe pt-safe pb-lg">
      {/* ── Cabecera ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between pt-md">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-faint">
          {format(fromKey(dateKey), "EEEE d 'de' MMMM", { locale: es })}
        </p>
        {state.phase && (
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-muted">
            {/* La fase se dice con un punto y una palabra. Antes teñía
                la app entera y el rojo dejaba de significar nada. */}
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: "var(--phase)" }}
            />
            {PHASE_LABEL[state.phase]}
          </p>
        )}
      </header>

      {/* ── Lilita y su frase ─────────────────────────────────────
          Ella a la derecha, la frase pegada al margen izquierdo. El
          aire sobrante se acumula bajo el texto, donde se lee como
          respiración y no como un agujero entre controles. */}
      {/* Todo el bloque lleva al chat. Lilita ES la puerta: un botón
          aparte diciendo "hablar con la IA" convertiría al personaje
          en el envoltorio de una función, y es al revés. */}
      <Link
        href="/chat"
        onClick={() => haptic(8)}
        className="flex flex-1 flex-col rounded-2xl transition-[opacity] duration-150 active:opacity-70"
      >
        <div className="flex justify-end pr-xs">
          {/* Mientras sangra aparece también la fila de flujo, y en
              una pantalla de 812px eso empuja el botón principal
              fuera de vista. Lilita cede el sitio: durante la regla
              lo que importa es registrar, no admirarla. */}
          <Lilita mood={line.mood} size={bleeding ? 116 : 148} />
        </div>
        <p className="mt-md text-balance font-display text-lg font-semibold leading-[1.2] tracking-[-0.02em]">
          {line.text}
        </p>
        <p className="mt-2 flex items-center gap-1 text-xs text-faint">
          Pregúntame lo que quieras
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 5 L16 12 L9.5 19" />
          </svg>
        </p>
      </Link>

      {/* ── El dato ───────────────────────────────────────────────
          Titular = lo que quiere saber al abrir la app. Cuando sangra
          es "qué día de regla llevo"; cuando no, "cuánto falta". El
          día del ciclo es una abstracción y baja a línea de apoyo. */}
      {state.dayOfCycle !== undefined && (
        <section className="border-t border-line pt-md">
          <Headline
            state={state}
            bleeding={bleeding}
            startedOn={latest?.startDate}
          />

          {canUndo && (
            <button
              type="button"
              onClick={() => {
                haptic(8);
                void deleteCycle(latest.id);
              }}
              className="mt-2 -ml-1 px-1 py-1 text-xs text-faint underline underline-offset-4"
            >
              No, me he equivocado
            </button>
          )}
        </section>
      )}

      {/* ── Registro rápido ────────────────────────────────────────
          El flujo solo aparece mientras sangra: el resto del mes es
          un control muerto ocupando el mejor sitio de la pantalla. */}
      {bleeding && <FlowRow day={today} dateKey={dateKey} />}
      <MoodRow day={today} dateKey={dateKey} />

      {/* ── Acción principal ──────────────────────────────────────
          En el tercio inferior, siempre. Es el 90% de lo que hará
          nunca en esta app y se tiene que poder pulsar con el pulgar
          sin mirar. */}
      <section>
        <button
          type="button"
          onClick={() => {
            haptic(12);
            // Ya no asume hoy: preguntar la fecha es el arreglo.
            setAsking(bleeding ? "fin" : "inicio");
          }}
          className="w-full rounded-full px-lg py-4 font-display text-base font-bold tracking-[-0.01em] transition-[transform,background-color] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.975]"
          style={
            bleeding
              ? {
                  background: "transparent",
                  color: "var(--accent)",
                  boxShadow: "inset 0 0 0 1.5px var(--accent)",
                }
              : { background: "var(--accent)", color: "var(--on-accent)" }
          }
        >
          {bleeding ? "Se ha ido" : "Me ha bajado"}
        </button>
      </section>

      <PeriodSheet
        action={asking}
        todayKey={dateKey}
        minKey={asking === "fin" ? latest?.startDate : undefined}
        onPick={(when) => {
          void (asking === "fin" ? endPeriod(when) : startPeriod(when));
        }}
        onClose={() => setAsking(null)}
      />
    </div>
  );
}

/* ── Titular ─────────────────────────────────────────────────────
   Un número grande, una unidad, y una línea de contexto debajo.
   Nunca una fecha exacta: la predicción es un rango y se dice como
   rango. Fingir precisión sobre el cuerpo de alguien es mentirle
   con estilo. */

function Headline({
  state,
  bleeding,
  startedOn,
}: {
  state: CycleState;
  bleeding: boolean;
  startedOn?: string;
}) {
  const cycleDay = `Día ${state.dayOfCycle} del ciclo`;

  if (bleeding && state.periodDay) {
    // La fecha de inicio escrita es la confirmacion de lo apuntado:
    // antes tocabas el boton, cambiaba un numero y no habia forma de
    // comprobar que dia habia quedado registrado.
    const desde = startedOn
      ? `Empezó el ${capitalize(
          format(fromKey(startedOn), "EEEE d", { locale: es }),
        ).toLowerCase()}`
      : null;
    return (
      <Big
        label="Día de regla"
        value={String(state.periodDay)}
        detail={desde ? `${desde} · ${cycleDay}` : cycleDay}
      />
    );
  }

  if (state.daysLate > 0) {
    return (
      <Big
        label="Retraso"
        value={String(state.daysLate)}
        unit={state.daysLate === 1 ? "día" : "días"}
        detail={`Estaba prevista para el día ${state.avgLength} · ${cycleDay}`}
        alarm
      />
    );
  }

  if (state.confidence === "ninguna") {
    return (
      <Big
        label="Día del ciclo"
        value={String(state.dayOfCycle)}
        detail="Con un solo ciclo no puedo predecir nada todavía"
      />
    );
  }

  const d = state.daysUntilNext ?? 0;
  const spread = state.predictionRange
    ? Math.max(
        1,
        Math.round(
          (state.predictionRange.latest - state.predictionRange.earliest) / 2,
        ),
      )
    : 2;

  // Desde dateKey, no desde new Date(): el resto de la app calcula
  // con esa clave y aquí no puede salir un día distinto.
  const base = fromKey(state.todayKey);
  const from = addDays(base, Math.max(0, d - spread));
  const to = addDays(base, d + spread);

  return (
    <Big
      label={d === 0 ? "Prevista" : "Faltan"}
      value={d === 0 ? "Hoy" : String(d)}
      unit={d === 0 ? undefined : d === 1 ? "día" : "días"}
      detail={`Empieza ${dateRange(from, to)} · ${cycleDay}`}
      caveat={
        state.confidence === "baja"
          ? `Solo tengo ${state.cyclesLogged} ${state.cyclesLogged === 1 ? "ciclo" : "ciclos"} completos, así que me lo invento bastante`
          : undefined
      }
    />
  );
}

function Big({
  label,
  value,
  unit,
  detail,
  caveat,
  alarm,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  caveat?: string;
  alarm?: boolean;
}) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
      <p
        className="tnum font-display text-3xl leading-[0.9] tracking-[-0.045em]"
        style={alarm ? { color: "var(--accent)" } : undefined}
      >
        {value}
        {unit && (
          <span className="ml-2 font-sans text-base font-normal tracking-normal text-muted">
            {unit}
          </span>
        )}
      </p>
      <p className="mt-2 text-xs text-muted">{detail}</p>
      {caveat && <p className="mt-0.5 text-xs text-faint">{caveat}</p>}
    </div>
  );
}

/* Estado de arranque: Lilita ya está, los números todavía no. Que
   aparezca ella primero hace que la espera se lea como intención. */
function Booting() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-lg">
      <Lilita mood="dormida" size={132} />
      <p className="text-sm text-faint">Despertando a Lilita…</p>
    </div>
  );
}
