"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "@/components/lilita";
import { PeriodStartFX } from "@/components/period-start-fx";
import { DaySheet, type Paso } from "@/components/day-sheet";
import { CycleRing } from "@/components/cycle-ring";
import { CookieMonsterButton } from "@/components/cookie-monster-button";
import { PasButton } from "@/components/pas-button";
import { PHASE_LABEL, type CycleState } from "@/lib/cycle";
import { fromKey, setPill, type DayLog } from "@/lib/db";
import { haptic, useLilaila } from "@/lib/use-lilaila";
import { lookAhead } from "@/lib/ahead";

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
  // En qué pregunta abre la ficha: la casilla de "Sangrado" va directa
  // al sangrado, la de "Cómo va" a cómo va. Sin nada, decide la ficha.
  const [startAt, setStartAt] = useState<Paso | undefined>(undefined);

  // Lo que suele tocar en los próximos días, si hay patrón de verdad.
  const ahead = useMemo(
    () => (ready ? lookAhead(days, cycles, settings, state.dayOfCycle) : null),
    [ready, days, cycles, settings, state.dayOfCycle],
  );



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
  const cta = mainAction(today);

  return (
    <div className="flex flex-1 flex-col gap-sm px-safe pt-safe pb-[34px]">
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
        <RingFit>
          {(size) => (
            <CycleRing
              size={size}
              day={state.dayOfCycle!}
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
                setStartAt(undefined);
                setDetailing(key);
              }}
            >
              <Big {...head} />
            </CycleRing>
          )}
        </RingFit>
      ) : (
        <div className="flex flex-1 items-center justify-center py-lg">
          <Lilita mood={line.mood} size={124} />
        </div>
      )}

      {/* ── Lo que dice Lilita ────────────────────────────────────
          Un bocadillo que sale del anillo. Lilita ES la puerta del
          chat: tocar lo que dice es contestarle. */}
      <Link
        href="/chat"
        onClick={() => haptic(8)}
        aria-label={`${line.text} Contestar a Lilita`}
        className="sticker-phase relative flex items-center gap-2 rounded-[20px] py-2.5 pr-3 pl-md"
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
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 text-pretty font-display text-[15px] font-semibold leading-[1.25] tracking-[-0.01em]">
            {line.text}
          </span>
          {/* Lo que suele tocar en los próximos días: los patrones de
              Historial mirando hacia delante. */}
          {ahead && (
            <span
              className="mt-0.5 block truncate text-xs font-semibold text-muted"
              aria-label={`${ahead.text}. Pasó en ${ahead.hits} de ${ahead.of} ciclos.`}
            >
              🔮 {ahead.short}
            </span>
          )}
        </span>
        {/* Antes había una línea entera de "Contestar a Lilita ›".
            La flecha dice lo mismo sin gastar altura: todo el bocadillo
            es el botón. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5 shrink-0"
          fill="none"
          stroke="var(--phase)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* ── Lo de un toque ───────────────────────────────────────
          Tres botones del mismo tamaño en una fila: la pastilla, el PAS
          y Cookie Monster. Antes había tres casillas (pastilla, sangrado,
          cómo va) y debajo otra fila con PAS y Cookie que se quedaba
          escondida detrás del botón grande. Sangrado y cómo va ya los
          pregunta "Apuntar hoy"; aquí solo queda lo que se hace sin
          pensar. */}
      <div className="flex gap-2">
        {settings.pill.enabled && (
          <PillButton
            taken={today?.pill}
            streak={pillStreak}
            onClick={() => {
              haptic(today?.pill === true ? 6 : 14);
              void setPill(dateKey, today?.pill === true ? undefined : true, new Date());
            }}
          />
        )}
        <PasButton />
        <CookieMonsterButton days={days} />
      </div>

      {/* ── Acción principal ──────────────────────────────────────
          Siempre abajo, siempre a mano: "Apuntar hoy", o "Ver lo de
          hoy" si ya hay algo. */}
      <button
        type="button"
        onClick={() => openSheet()}
        className="sticky z-30 w-full rounded-full px-lg py-4 font-display text-base font-bold tracking-[-0.01em] transition-[transform,background-color,box-shadow] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.975] active:translate-x-[1px] active:translate-y-[1px]"
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
        startAt={startAt}
        onClose={() => setDetailing(null)}
        onPeriodStart={() => setCelebrating(true)}
      />
    </div>
  );

  function openSheet(paso?: Paso) {
    haptic(12);
    setStartAt(paso);
    setDetailing(dateKey);
  }
}

/* ── El anillo, tan grande como quepa ─────────────────────────
   Se queda con todo el alto que sobra entre la cabecera y lo de
   abajo, y el anillo es el cuadrado más grande que entra ahí (menos
   la línea de debajo). En un iPhone grande crece; en uno pequeño
   encoge en vez de empujar los botones fuera de la pantalla. */

const RING_BELOW = 50; // la línea de debajo del anillo (cycle-ring)

function RingFit({ children }: { children: (size: number) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.floor(Math.min(width - 8, height - RING_BELOW, 380));
      setSize(Math.max(200, s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="relative min-h-[250px] flex-1">
      <div className="absolute inset-0 flex items-center justify-center">
        {size !== null && children(size)}
      </div>
    </div>
  );
}

/* ── La pastilla, de un toque ───────────────────────────────────
   Pendiente: pegatina con acento, que es lo único diario que se
   olvida. Hecha: verde, el único color que dice "esto ya está". */

function PillButton({
  taken,
  streak,
  onClick,
}: {
  taken: boolean | undefined;
  streak: number;
  onClick: () => void;
}) {
  const done = taken !== undefined;
  const label = taken === true ? "Tomada" : taken === false ? "Hoy no" : "¿Pastilla?";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={taken === true}
      aria-label={
        taken === true
          ? `Pastilla tomada${streak >= 3 ? `, ${streak} días seguidos` : ""}. Toca para desmarcar.`
          : "Pastilla: toca para marcarla como tomada"
      }
      className={`${done ? "flat" : "sticker-sm"} quick-btn`}
      style={{
        background: done ? "var(--ok-bg)" : "var(--surface)",
        boxShadow: done ? "inset 0 0 0 1.5px var(--ok)" : undefined,
        color: done ? "var(--ok)" : "var(--accent)",
      }}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {taken === true ? "✓" : "💊"}
      </span>
      <span>
        {label}
        {taken === true && streak >= 3 && <span className="font-normal"> · {streak}</span>}
      </span>
    </button>
  );
}

/** El botón grande. Siempre lo mismo: apuntar el día. Antes cambiaba
    a "Me ha bajado" cerca de la fecha prevista, y registrar un día
    empezaba por un sí o no sobre la regla. Ahora la regla se apunta
    desde la propia ficha, en la pregunta del sangrado. */
function mainAction(today: DayLog | undefined): string {
  const hecho = today?.flow !== undefined || today?.painLevel !== undefined;
  return hecho ? "Ver lo de hoy" : "Apuntar hoy";
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
    <div className="flex items-center gap-2.5">
      <p
        className="tnum font-display text-[40px] font-extrabold leading-none tracking-[-0.045em]"
        style={alarm ? { color: "var(--accent)" } : undefined}
      >
        {value}
        {unit && (
          <span className="ml-1 font-sans text-base font-normal tracking-normal text-muted">
            {unit}
          </span>
        )}
      </p>
      <div className="flex min-w-0 flex-col items-start text-left">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</p>
        <p className="mt-0.5 text-[13px] font-semibold leading-tight">{detail}</p>
        {caveat && <p className="text-2xs leading-snug text-faint">{caveat}</p>}
      </div>
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
