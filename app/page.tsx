"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "@/components/lilita";
import { PeriodStartFX } from "@/components/period-start-fx";
import { DaySheet } from "@/components/day-sheet";
import { CycleRing } from "@/components/cycle-ring";
import { CookieMonsterButton } from "@/components/cookie-monster-button";
import { PasButton } from "@/components/pas-button";
import { PHASE_LABEL, type CycleState } from "@/lib/cycle";
import { FLOW, labelOf } from "@/lib/labels";
import { fromKey, setPill, type DayLog } from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";

export default function Hoy() {
  // La frase de hoy sale siempre del banco local escrito a mano
  // (lib/lilita/lines.ts). Hubo una versión que la generaba con un
  // modelo y la sustituía si contestaba a tiempo — pero el banco local
  // está escrito y calibrado a mano, y lo generado sonaba peor. Ya no
  // se llama a /api/lilita aquí; ese endpoint sigue vivo solo para el
  // chat, que sí es una conversación abierta y no tiene banco posible.
  const { ready, state, today, line, dateKey, cycles, settings, pillStreak, days, windows } =
    useLilaila();

  // Solo cuando EMPIEZA una regla, no cada día que sigue sangrando:
  // gastar la fanfarria a diario la convierte en ruido.
  const [celebrating, setCelebrating] = useState(false);
  // La ficha abierta: hoy, o un día pasado elegido desde el anillo.
  const [detailing, setDetailing] = useState<string | null>(null);



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

  const head = headline(state, bleeding, latest?.startDate);
  const cta = mainAction(state, today?.flow);

  return (
    <div className="flex flex-1 flex-col gap-md px-safe pt-safe pb-md">
      <header className="flex items-center justify-between pt-sm">
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

      {/* ── El ciclo, como un reloj ──────────────────────────────
          Antes Lilita sola ocupaba la primera pantalla y el dato iba
          en otra tarjeta debajo. Ahora el dato vive dentro del ciclo
          dibujado, con Lilita en el centro: dónde estás y cuánto
          falta, en una sola mirada. */}
      {state.dayOfCycle !== undefined && latest ? (
        <CycleRing
          day={state.dayOfCycle}
          length={state.avgLength}
          periodLength={state.model.periodLength}
          bleeding={bleeding}
          range={state.predictionRange}
          startKey={latest.startDate}
          days={days}
          sensitive={windows.sensitive}
          monster={windows.monster}
          mood={line.mood}
          onOpenDay={(key) => {
            haptic(12);
            setDetailing(key);
          }}
        >
          <Big {...head} />
        </CycleRing>
      ) : (
        <div className="flex justify-center py-lg">
          <Lilita mood={line.mood} size={124} />
        </div>
      )}

      {/* ── Lo que dice Lilita ────────────────────────────────────
          Un bocadillo que sale del anillo. Lilita ES la puerta del
          chat: tocar lo que dice es contestarle. */}
      <Link
        href="/chat"
        onClick={() => haptic(8)}
        className="sticker-phase relative -mt-1 rounded-[22px] px-md pt-sm pb-sm"
        style={{ background: "var(--phase-bg)" }}
      >
        <span
          aria-hidden="true"
          className="absolute -top-[8px] left-1/2 size-4 -translate-x-1/2 rotate-45"
          style={{
            background: "var(--phase-bg)",
            borderLeft: "1.5px solid var(--phase)",
            borderTop: "1.5px solid var(--phase)",
          }}
        />
        <p className="text-balance font-display text-[15.5px] font-semibold leading-[1.25] tracking-[-0.01em]">
          {line.text}
        </p>
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--phase)" }}>
          Contestar a Lilita ›
        </p>
      </Link>

      {/* ── Hoy, de un vistazo ────────────────────────────────────
          Lo que se pregunta cada día, en casillas. Verde = ya está.
          La pastilla se marca aquí mismo de un toque; sangrado y
          ánimo abren la ficha, porque tienen más de una respuesta. */}
      <section aria-label="Hoy">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.16em] text-faint">
          Hoy
        </h2>
        <div
          className="mt-2 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${settings.pill.enabled ? 3 : 2}, minmax(0, 1fr))` }}
        >
          {settings.pill.enabled && (
            <Tile
              label="Pastilla"
              value={
                today?.pill === true ? "Tomada" : today?.pill === false ? "Hoy no" : "¿Tomada?"
              }
              hint={
                today?.pill === true
                  ? pillStreak >= 3
                    ? `${pillStreak} días seguidos`
                    : "✓ apuntada"
                  : today?.pill === false
                    ? "apuntado"
                    : "Toca y listo"
              }
              done={today?.pill !== undefined}
              urgent={today?.pill === undefined}
              onClick={() => {
                haptic(today?.pill === true ? 6 : 14);
                void setPill(
                  dateKey,
                  today?.pill === true ? undefined : true,
                  new Date(),
                );
              }}
            />
          )}
          <Tile
            label="Sangrado"
            value={labelOf(FLOW, today?.flow) ?? "—"}
            hint={today?.flow !== undefined ? "✓ apuntado" : "sin contestar"}
            done={today?.flow !== undefined}
            onClick={openSheet}
          />
          <Tile
            label="Cómo va"
            value={dayFeeling(today) ?? "—"}
            hint={dayFeeling(today) ? "✓ apuntado" : "sin contestar"}
            done={dayFeeling(today) !== undefined}
            onClick={openSheet}
          />
        </div>
      </section>

      <div className="flex gap-2">
        <PasButton />
        <CookieMonsterButton days={days} />
      </div>

      {/* ── Acción principal ──────────────────────────────────────
          Siempre abajo, siempre a mano, y dice lo más probable de
          este momento del ciclo: "Me ha bajado" cuando toca, "¿Cuánto
          sangras?" con la regla, "Apuntar cómo voy" el resto. */}
      <button
        type="button"
        onClick={openSheet}
        className="sticky z-30 mt-auto w-full rounded-full px-lg py-4 font-display text-base font-bold tracking-[-0.01em] transition-[transform,background-color,box-shadow] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.975] active:translate-x-[1px] active:translate-y-[1px]"
        style={{
          // Pegado encima de la barra de pestañas: si la pantalla es
          // corta y hay que bajar, el botón no se va con el resto.
          bottom: "calc(72px + env(safe-area-inset-bottom))",
          background: "var(--accent)",
          color: "var(--on-accent)",
          boxShadow: "3px 3px 0 0 var(--depth-shadow)",
        }}
      >
        {cta}
      </button>

      <PeriodStartFX show={celebrating} onDone={() => setCelebrating(false)} />

      <DaySheet
        day={
          detailing
            ? {
                key: detailing,
                date: fromKey(detailing),
                isToday: detailing === dateKey,
                isFuture: false,
              }
            : null
        }
        onClose={() => setDetailing(null)}
        onPeriodStart={() => setCelebrating(true)}
      />
    </div>
  );

  function openSheet() {
    haptic(12);
    setDetailing(dateKey);
  }
}

/* ── Casilla de "Hoy" ───────────────────────────────────────────
   Tres estados: pendiente y urgente (la pastilla, que es diaria),
   pendiente sin más, y hecho (verde). El verde es el único color
   semántico de la pantalla, y solo dice "esto ya está". */

function Tile({
  label,
  value,
  hint,
  done,
  urgent,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  done: boolean;
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${urgent ? "sticker-sm" : "flat"} flex min-h-[76px] flex-col items-start rounded-2xl px-3 py-2 text-left`}
      style={{
        background: done ? "var(--ok-bg)" : "var(--surface)",
        boxShadow: done ? "inset 0 0 0 1.5px var(--ok)" : undefined,
      }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: done ? "var(--ok)" : "var(--fg-faint)" }}
      >
        {label}
      </span>
      <span
        className="mt-0.5 font-display text-base font-bold leading-tight"
        style={{ color: done || urgent ? "var(--fg)" : "var(--fg-faint)" }}
      >
        {value}
      </span>
      <span
        className="mt-auto text-2xs"
        style={{
          color: done ? "var(--ok)" : urgent ? "var(--accent)" : "var(--fg-faint)",
          fontWeight: urgent ? 600 : 450,
        }}
      >
        {hint}
      </span>
    </button>
  );
}

/** "Bien", "Regular"... a partir del dolor y el freno de mano, igual
    que lo marca la fila de la ficha. */
function dayFeeling(log: DayLog | undefined): string | undefined {
  if (!log || log.painLevel === undefined) return undefined;
  if (log.badDay) return "De mierda";
  if (log.painLevel >= 7) return "Mal";
  if (log.painLevel >= 3) return "Regular";
  return "Bien";
}

/** La acción más probable ahora mismo. */
function mainAction(state: CycleState, flowToday: number | undefined): string {
  if (state.bleeding) {
    return flowToday === undefined ? "¿Cuánto sangras hoy?" : "Apuntar cómo voy";
  }
  const d = state.daysUntilNext;
  if (state.daysLate > 0 || (d !== undefined && d <= 3 && state.confidence !== "ninguna")) {
    return "Me ha bajado";
  }
  return "Apuntar cómo voy";
}

/* ── Titular ─────────────────────────────────────────────────────
   Un número grande, una unidad, y una línea de contexto debajo.
   Nunca una fecha exacta: la predicción es un rango y se dice como
   rango. Fingir precisión sobre el cuerpo de alguien es mentirle
   con estilo. Ahora vive dentro del anillo, así que es corto. */

type Head = {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  caveat?: string;
  alarm?: boolean;
};

function headline(
  state: CycleState,
  bleeding: boolean,
  startedOn?: string,
): Head {
  const cycleDay = `Día ${state.dayOfCycle} de ${state.avgLength}`;

  if (bleeding && state.periodDay) {
    // La fecha de inicio escrita es la confirmacion de lo apuntado:
    // antes tocabas el boton, cambiaba un numero y no habia forma de
    // comprobar que dia habia quedado registrado.
    const desde = startedOn
      ? `empezó el ${format(fromKey(startedOn), "EEEE d", { locale: es })}`
      : cycleDay;
    return { label: "Día de regla", value: String(state.periodDay), detail: desde };
  }

  if (state.daysLate > 0) {
    return {
      label: "Retraso",
      value: String(state.daysLate),
      unit: state.daysLate === 1 ? "día" : "días",
      detail: `Día ${state.dayOfCycle} del ciclo`,
      alarm: true,
    };
  }

  if (state.confidence === "ninguna") {
    return {
      label: "Día del ciclo",
      value: String(state.dayOfCycle),
      detail: "Con un ciclo no predigo nada",
    };
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

  return {
    label: d === 0 ? "Prevista" : "Para la regla",
    value: d === 0 ? "Hoy" : String(d),
    unit: d === 0 ? undefined : d === 1 ? "día" : "días",
    // El día del ciclo ya lo lleva la chapa del anillo. Con pocos
    // ciclos, el rango se dice como lo que es: aproximado.
    detail:
      state.confidence === "baja"
        ? `${shortRange(from, to)} · a ojo`
        : shortRange(from, to),
  };
}

/** "13–15 oct", o "30 sep–2 oct" cruzando mes. */
function shortRange(from: Date, to: Date): string {
  const m = (d: Date) => format(d, "MMM", { locale: es }).replace(".", "");
  if (from.getTime() === to.getTime()) return `${from.getDate()} ${m(from)}`;
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()}–${to.getDate()} ${m(to)}`
    : `${from.getDate()} ${m(from)}–${to.getDate()} ${m(to)}`;
}

function Big({ label, value, unit, detail, caveat, alarm }: Head) {
  return (
    <div className="mt-0.5 flex flex-col items-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        {label}
      </p>
      <p
        className="tnum font-display text-[40px] font-extrabold leading-[0.95] tracking-[-0.045em]"
        style={alarm ? { color: "var(--accent)" } : undefined}
      >
        {value}
        {unit && (
          <span className="ml-1.5 font-sans text-base font-normal tracking-normal text-muted">
            {unit}
          </span>
        )}
      </p>
      <p className="mt-0.5 max-w-[16ch] text-[13px] font-semibold leading-tight">{detail}</p>
      {caveat && <p className="max-w-[17ch] text-2xs leading-snug text-faint">{caveat}</p>}
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
