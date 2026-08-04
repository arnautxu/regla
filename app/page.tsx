"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "@/components/lilita";
import { FlowRow } from "@/components/flow-row";
import { MoodRow } from "@/components/mood-row";
import { PeriodSheet } from "@/components/period-sheet";
import { PeriodStartFX } from "@/components/period-start-fx";
import { DaySheet } from "@/components/day-sheet";
import { PHASE_LABEL, type CycleState } from "@/lib/cycle";
import { capitalize, dateRange } from "@/lib/format";
import {
  clearPeriodAround,
  fromKey,
  setBleeding,
  startPeriod,
  upsertDay,
  type DayLog,
  type FlowLevel,
} from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";

export default function Hoy() {
  // La frase de hoy sale siempre del banco local escrito a mano
  // (lib/lilita/lines.ts). Hubo una versión que la generaba con un
  // modelo y la sustituía si contestaba a tiempo — pero el banco local
  // está escrito y calibrado a mano, y lo generado sonaba peor. Ya no
  // se llama a /api/lilita aquí; ese endpoint sigue vivo solo para el
  // chat, que sí es una conversación abierta y no tiene banco posible.
  const { ready, state, today, line, dateKey, cycles } = useLilaila();

  const [asking, setAsking] = useState(false);
  // Solo al CONFIRMAR que empieza la regla, no en cada "Registrar
  // hoy" de los días siguientes — eso gastaría la broma en un día.
  const [celebrating, setCelebrating] = useState(false);
  const [detailing, setDetailing] = useState(false);

  // Borrador de hoy: tocar el flujo o el ánimo NO escribe nada
  // todavía. Si escribiera al primer toque, "Me ha bajado" dejaría de
  // significar "confirmar" — ya estaría contado, y encima a media
  // composición (sin dar tiempo a añadir síntomas). Se confirma todo
  // junto al pulsar el botón principal. Los síntomas/ánimo detallados
  // (vía "Añadir síntomas…") sí se guardan al toque, porque esos no
  // deciden si el día cuenta.
  const [draftFlow, setDraftFlow] = useState<FlowLevel | undefined>(
    undefined,
  );
  const [draftMood, setDraftMood] = useState<{
    painLevel?: number;
    badDay?: boolean;
  }>({});

  // Antes de que IndexedDB conteste no pintamos números: un "día 1"
  // fantasma que salta a "día 14" es peor que medio segundo en blanco.
  if (!ready) return <Booting />;

  // "bleeding" es la lectura para pintar (cabecera, fase, Lilita): si
  // la regla sigue abierta y hoy entra en el rango, se asume que hoy
  // también sangra aunque todavía no lo hayas tocado — si no, la
  // cabecera saltaba a "faltan 26 días" con la etiqueta diciendo
  // "REGLA" al lado, porque nadie había pulsado nada todavía hoy.
  const bleeding = state.bleeding;
  const latest = cycles[cycles.length - 1];

  /* El boton registra UN dia, no un tramo.
       · hoy ya apuntado  -> no hay nada que hacer, lo dice y deja editar
       · regla en marcha  -> "Registrar hoy", de un toque
       · nada en marcha   -> "Me ha bajado", que pregunta el dia
     El final de la regla no se declara: se marca "Nada" en el flujo.

     A diferencia de "bleeding" de arriba, esto NO se supone: el botón
     solo puede decir "ya está apuntado" si hoy tiene un flujo de
     verdad guardado. El día cuenta cuando le das al botón (o al
     flujo directamente) — nunca antes. */
  const loggedToday = today?.flow !== undefined && today.flow > 0;
  const reglaAbierta = Boolean(latest && !latest.endDate);
  const accion: "apuntado" | "hoy" | "inicio" = loggedToday
    ? "apuntado"
    : reglaAbierta
      ? "hoy"
      : "inicio";
  // El deshacer vale durante toda la regla en curso: darse cuenta
  // del dedazo al dia siguiente es lo normal.
  const canUndo = reglaAbierta || latest?.startDate === dateKey;

  // El borrador se aplica junto, en un solo upsertDay: así "Me ha
  // bajado" cuenta como un único gesto, no como el primer toque que
  // diera la casualidad de tocarse.
  function draftPatch(): Partial<DayLog> {
    const patch: Partial<DayLog> = {};
    if (draftFlow !== undefined) patch.flow = draftFlow;
    if (draftMood.painLevel !== undefined || draftMood.badDay !== undefined) {
      patch.painLevel = draftMood.painLevel;
      patch.badDay = draftMood.badDay;
    }
    return patch;
  }
  function resetDraft() {
    setDraftFlow(undefined);
    setDraftMood({});
  }

  return (
    <div className="flex flex-1 flex-col gap-lg px-safe pt-safe pb-lg">
      {/* ── Hoy, en su fase ────────────────────────────────────────
          El bloque entero se tiñe del color de la fase: es lo primero
          que se ve al abrir la app, y una manera más directa de decir
          "estás aquí" que una etiqueta pequeña sola. Todo el bloque
          lleva al chat — Lilita ES la puerta: un botón aparte diciendo
          "hablar con la IA" convertiría al personaje en el envoltorio
          de una función, y es al revés. */}
      <Link
        href="/chat"
        onClick={() => haptic(8)}
        className="sticker-phase flex flex-col rounded-[28px] px-lg pt-md pb-lg transition-[opacity,transform] duration-150"
        style={{ background: "var(--phase-bg)" }}
      >
        <header className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-faint">
            {format(fromKey(dateKey), "EEEE d 'de' MMMM", { locale: es })}
          </p>
          {state.phase && (
            <p
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.16em]"
              style={{ background: "var(--phase-surface)", color: "var(--phase)" }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: "var(--phase)" }}
              />
              {PHASE_LABEL[state.phase]}
            </p>
          )}
        </header>

        <div className="flex justify-end pr-xs">
          {/* El flujo ya es fijo, así que siempre hay una fila más
              que antes. Lilita cede el sitio: en una pantalla de
              812px, si no, el botón principal se sale. */}
          <Lilita mood={line.mood} size={bleeding ? 100 : 124} />
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
        <section
          className="sticker rounded-2xl px-lg py-md"
          style={{ background: "var(--surface)" }}
        >
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
                void clearPeriodAround(latest.startDate);
                resetDraft();
              }}
              className="-ml-1 mt-1 flex min-h-[44px] items-center px-1 text-xs text-faint underline underline-offset-4"
            >
              No, me he equivocado
            </button>
          )}
        </section>
      )}

      {/* ── Registro rápido ────────────────────────────────────────
          Agrupados en una sola superficie: son un mismo gesto ("cómo
          estoy hoy"), no controles sueltos flotando en la página. */}
      <section
        className="sticker flex flex-col gap-md rounded-2xl px-lg py-md"
        style={{ background: "var(--surface)" }}
      >
        <FlowRow
          value={loggedToday ? today?.flow : draftFlow}
          onChange={(v) => {
            if (loggedToday) void upsertDay(dateKey, { flow: v });
            else setDraftFlow(v);
          }}
          dateKey={dateKey}
        />
        <MoodRow
          value={loggedToday ? today : draftMood}
          onChange={(patch) => {
            if (loggedToday) void upsertDay(dateKey, patch);
            else setDraftMood(patch);
          }}
          dateKey={dateKey}
        />

        {/* Abre el detalle —sintomas, animo, nota— sin ocupar sitio en
            la pantalla mientras no se use. */}
        <button
          type="button"
          onClick={() => {
            haptic(8);
            setDetailing(true);
          }}
          className="-ml-1 flex min-h-[44px] items-center self-start px-1 text-xs underline underline-offset-4"
          style={{ color: "var(--fg-muted)" }}
        >
          {resumenDetalle(today)}
        </button>
      </section>

      {/* ── Acción principal ──────────────────────────────────────
          En el tercio inferior, siempre. Es el 90% de lo que hará
          nunca en esta app y se tiene que poder pulsar con el pulgar
          sin mirar. */}
      <section>
        <button
          type="button"
          onClick={() => {
            if (accion === "apuntado") {
              haptic(8);
              setDetailing(true);
            } else if (accion === "hoy") {
              // Un toque y ya: es "hoy", no hace falta preguntar cuando.
              // Aquí es donde el borrador (flujo/ánimo) se hace de
              // verdad — no antes, por mucho que se haya tocado.
              haptic([18, 40, 26]);
              void (async () => {
                const patch = draftPatch();
                if (patch.flow !== undefined) {
                  await upsertDay(dateKey, patch);
                } else {
                  await setBleeding(dateKey, true);
                  if (Object.keys(patch).length) {
                    await upsertDay(dateKey, patch);
                  }
                }
                resetDraft();
              })();
            } else {
              haptic(12);
              setAsking(true);
            }
          }}
          className="w-full rounded-full px-lg py-4 font-display text-base font-bold tracking-[-0.01em] transition-[transform,background-color,box-shadow] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.975] active:translate-x-[1px] active:translate-y-[1px]"
          style={
            accion === "apuntado"
              ? {
                  background: "transparent",
                  color: "var(--fg-muted)",
                  boxShadow: "var(--depth-sm)",
                }
              : {
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                  boxShadow: "3px 3px 0 0 var(--depth-shadow)",
                }
          }
        >
          {accion === "apuntado"
            ? "Hoy ya está apuntado"
            : accion === "hoy"
              ? "Registrar hoy"
              : "Me ha bajado"}
        </button>

        {accion === "hoy" && (
          <p className="mt-2 text-center text-xs text-faint">
            Cuando marques «Nada» en el flujo, se acabó.
          </p>
        )}
      </section>

      <PeriodSheet
        open={asking}
        todayKey={dateKey}
        onPick={(when) => {
          void (async () => {
            await startPeriod(when);
            // El borrador es de HOY (síntomas/ánimo de "cómo estoy"),
            // así que se aplica a hoy aunque el inicio elegido sea
            // otro día — "hace 2 días" no cambia lo que sientes hoy.
            const patch = draftPatch();
            if (Object.keys(patch).length) {
              await upsertDay(dateKey, patch);
            }
            resetDraft();
          })();
          setCelebrating(true);
        }}
        onClose={() => setAsking(false)}
      />

      <PeriodStartFX show={celebrating} onDone={() => setCelebrating(false)} />

      <DaySheet
        day={
          detailing
            ? {
                key: dateKey,
                date: fromKey(dateKey),
                isToday: true,
                isFuture: false,
              }
            : null
        }
        onClose={() => setDetailing(false)}
      />
    </div>
  );
}

/* El enlace dice lo que ya hay apuntado, no solo "añadir detalles":
   asi se ve de un vistazo si el dia esta registrado sin abrir nada. */
function resumenDetalle(day: DayLog | undefined): string {
  const n = (day?.symptoms?.length ?? 0) + (day?.mood?.length ?? 0);
  if (n === 0) return "Añadir síntomas, ánimo o una nota";
  const nota = day?.note ? " y una nota" : "";
  return `${n} ${n === 1 ? "cosa apuntada" : "cosas apuntadas"}${nota} — editar`;
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
