"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Lilita } from "@/components/lilita";
import { PHASE_LABEL, phaseByDay, type Phase } from "@/lib/cycle";
import { fromKey, toKey, type DayLog } from "@/lib/db";
import { FLOW, labelOf } from "@/lib/labels";
import type { Mood } from "@/lib/lilita/lines";
import type { EpisodeWindow } from "@/lib/episodes";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   EL ANILLO DEL CICLO

   El ciclo entero como un reloj: una cuenta por día, teñida con su
   fase, empezando arriba en el día 1 y girando como las agujas. Lo
   vivido va en tinta plena y con su sombra de pegatina; lo que
   queda, en tenue. Lilita vive en el centro.

   Se toca: arrastrar por el anillo mueve la chapa día a día (con un
   toque háptico en cada uno) y el centro cuenta ese día. Hacia atrás,
   lo apuntado; hacia delante, lo previsto. Al soltar, la chapa
   vuelve sola a hoy.

   Por fuera, en discontinuo, lo calculado: la regla prevista y, si
   hay patrón, la semana sensible (PAS) y la zona monstruo (enfados).
   Por dentro, lo que pasó: una lágrima por PAS y una galleta por
   enfado. Es la jerarquía de certeza del calendario: lo registrado
   es trazo pleno, lo calculado no.

   Si va con retraso, el anillo crece con los días de más (en tono de
   regla) en vez de dar la vuelta y fingir un día 1 que no ha llegado.
   ═══════════════════════════════════════════════════════════════ */

const PHASE_VAR: Record<Phase, string> = {
  menstrual: "var(--ph-menstrual)",
  folicular: "var(--ph-folicular)",
  ovulacion: "var(--ph-ovulacion)",
  lutea: "var(--ph-lutea)",
};

/** Cómo se pone Lilita al pasar por cada fase. */
const PHASE_MOOD: Record<Phase, Mood> = {
  menstrual: "exhausta",
  folicular: "energica",
  ovulacion: "flirty",
  lutea: "gremlin",
};

/** Lo que tarda la chapa en volver a hoy después de soltarla. */
const BACK_TO_TODAY_MS = 6000;

export function CycleRing({
  day,
  length,
  periodLength,
  bleeding,
  range,
  startKey,
  days,
  sensitive,
  monster,
  mood,
  onOpenDay,
  size = 252,
  children,
}: {
  /** Día del ciclo de hoy, 1 = primer día de regla */
  day: number;
  /** Longitud media del ciclo */
  length: number;
  periodLength: number;
  bleeding: boolean;
  /** Rango previsto del próximo inicio, en días desde hoy */
  range?: { earliest: number; latest: number };
  /** Primer día del ciclo actual, 'YYYY-MM-DD' */
  startKey: string;
  /** Registros (basta con los del ciclo actual) */
  days: DayLog[];
  /** Semana sensible de PAS, si hay patrón */
  sensitive?: EpisodeWindow;
  /** Zona monstruo de enfados, si hay patrón */
  monster?: EpisodeWindow;
  /** Humor de Lilita hoy */
  mood: Mood;
  /** Abre la ficha de un día ya vivido */
  onOpenDay?: (key: string) => void;
  size?: number;
  /** Lo que se cuenta en el centro cuando la chapa está en hoy */
  children?: React.ReactNode;
}) {
  const total = Math.max(length, day);
  const c = size / 2;
  const r = c - 24;
  const gap = 4.5 / r; // aire entre cuentas, en radianes

  /* La chapa gira con CSS. Se guarda el ángulo SIN envolver para
     que al cruzar el día 1 dé el paso corto y no la vuelta entera. */
  const degOf = (d: number) => ((d - 0.5) / total) * 360;
  const [sel, setSel] = useState(day);
  const [deg, setDeg] = useState(() => degOf(day));
  const [dragging, setDragging] = useState(false);
  const back = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null);

  function move(d: number) {
    setSel(d);
    setDeg((prev) => prev + ((((degOf(d) - prev) % 360) + 540) % 360) - 180);
  }

  // Si cambia el día (medianoche con la app abierta), la chapa le sigue.
  const [seenDay, setSeenDay] = useState(day);
  if (seenDay !== day) {
    setSeenDay(day);
    move(day);
  }
  useEffect(() => () => clearTimeout(back.current), []);

  const angle = (d: number) => -Math.PI / 2 + (d / total) * 2 * Math.PI;
  const at = (a: number, radius = r) =>
    [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const;
  const arc = (from: number, to: number, radius = r) => {
    const [x0, y0] = at(from, radius);
    const [x1, y1] = at(to, radius);
    const large = to - from > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  const start = fromKey(startKey);
  const byKey = new Map(days.map((d) => [d.date, d]));
  const phaseOf = (d: number): Phase =>
    // Días de más por retraso, o regla que sigue más allá de lo
    // habitual: manda lo que pasa, no la media.
    d > length || (bleeding && d <= day && d > periodLength)
      ? "menstrual"
      : phaseByDay(d, length, periodLength);

  const segments = Array.from({ length: total }, (_, i) => {
    const d = i + 1;
    const key = toKey(addDays(start, i));
    const log = d <= day ? byKey.get(key) : undefined;
    return {
      d,
      key,
      phase: phaseOf(d),
      pas: log?.cryEvents?.length ?? 0,
      anger: log?.angerEvents?.length ?? 0,
    };
  });

  // La regla prevista, solo si no va con retraso: con retraso ya no
  // hay rango que dibujar, hay días que se acumulan.
  let predicted: string | null = null;
  let predictedFrom = Infinity;
  let predictedTo = -Infinity;
  if (range && day <= length) {
    predictedFrom = day + Math.max(range.earliest, 1);
    predictedTo = day + Math.max(range.latest, 1);
    predicted = arc(angle(predictedFrom - 1), angle(predictedTo), r + 13);
  }

  /* ── Tocar y arrastrar ──────────────────────────────────────── */
  function dayFrom(e: React.PointerEvent, strict: boolean): number | null {
    const el = box.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const k = size / rect.width;
    const x = (e.clientX - rect.left) * k - c;
    const y = (e.clientY - rect.top) * k - c;
    // El centro es de Lilita: tocarla no mueve la chapa.
    if (strict && Math.hypot(x, y) < r - 32) return null;
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += 2 * Math.PI;
    return Math.min(total, Math.floor((a / (2 * Math.PI)) * total) + 1);
  }

  function select(d: number) {
    if (d === sel) return;
    haptic(d === day ? 14 : 4);
    move(d);
  }

  function scheduleBack() {
    clearTimeout(back.current);
    back.current = setTimeout(() => move(day), BACK_TO_TODAY_MS);
  }

  function onKey(e: React.KeyboardEvent) {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (e.key === "Home" || e.key === "Escape") {
      e.preventDefault();
      move(day);
      return;
    }
    if (!step) return;
    e.preventDefault();
    select(Math.min(total, Math.max(1, sel + step)));
    scheduleBack();
  }

  const selPhase = phaseOf(sel);
  const selDate = addDays(start, sel - 1);
  const selKey = toKey(selDate);
  const offset = sel - day;
  const [tx, ty] = [c, c - r];

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Día del ciclo"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={sel}
      aria-valuetext={`Día ${sel}, ${PHASE_LABEL[selPhase]}${sel === day ? ", hoy" : ""}`}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        const d = dayFrom(e, true);
        if (d === null) {
          if (sel !== day) move(day);
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        clearTimeout(back.current);
        setDragging(true);
        select(d);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const d = dayFrom(e, false);
        if (d !== null) select(d);
      }}
      onPointerUp={() => {
        setDragging(false);
        if (sel !== day) scheduleBack();
      }}
      onPointerCancel={() => {
        setDragging(false);
        scheduleBack();
      }}
      className="cycle-ring relative mx-auto touch-none select-none outline-none"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
      >
        {/* Sombra de pegatina bajo lo vivido */}
        {segments.map(({ d }) =>
          d <= day ? (
            <path
              key={`s${d}`}
              d={arc(angle(d - 1) + gap, angle(d) - gap)}
              transform="translate(2 2)"
              fill="none"
              stroke="var(--depth-shadow)"
              strokeWidth={d === day ? 20 : 14}
              strokeLinecap="round"
              className="ring-in"
              style={{ animationDelay: `${d * 16}ms` }}
            />
          ) : null,
        )}

        {segments.map(({ d, phase }) => {
          const focus = d === sel && sel !== day;
          return (
            <path
              key={d}
              d={arc(angle(d - 1) + gap, angle(d) - gap)}
              fill="none"
              stroke={PHASE_VAR[phase]}
              strokeWidth={d === day ? 20 : focus ? 18 : 14}
              strokeLinecap="round"
              opacity={d <= day ? 1 : focus ? 0.7 : 0.24}
              className="ring-in transition-[stroke-width,opacity] duration-150"
              style={{ animationDelay: `${Math.min(d, day + 3) * 16}ms` }}
            />
          );
        })}

        {/* Ventanas con patrón: por fuera y en punteado, como todo lo calculado */}
        {sensitive && sensitive.from <= total && (
          <path
            d={arc(angle(sensitive.from - 1) + gap, angle(Math.min(sensitive.to, total)) - gap, r + 13)}
            fill="none"
            stroke="var(--fg-faint)"
            strokeWidth="2.5"
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
        )}
        {monster && monster.from <= total && (
          <path
            d={arc(angle(monster.from - 1) + gap, angle(Math.min(monster.to, total)) - gap, r + 19)}
            fill="none"
            stroke="var(--cookie)"
            strokeWidth="2.5"
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
        )}
        {predicted && (
          <path
            d={predicted}
            fill="none"
            stroke="var(--ph-menstrual)"
            strokeWidth="3"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}

        {/* Lo que pasó, dibujado encima de su cuenta: una lágrima por
            PAS y una galleta por enfado. Si hay las dos, una a cada
            lado de la cuenta. */}
        {segments.map(({ d, pas, anger }) => {
          if (!pas && !anger) return null;
          const both = pas && anger;
          const spread = both ? 0.32 / total : 0;
          const tear = at(angle(d - 0.5) - spread * Math.PI * 2);
          const cookie = at(angle(d - 0.5) + spread * Math.PI * 2);
          return (
            <g key={`m${d}`} className="ring-in" style={{ animationDelay: `${d * 16 + 200}ms` }}>
              {pas > 0 && <Tear x={tear[0]} y={tear[1]} />}
              {anger > 0 && <Cookie x={cookie[0]} y={cookie[1]} />}
            </g>
          );
        })}

        {/* La chapa */}
        <g
          style={{
            transform: `rotate(${deg}deg)`,
            transformOrigin: `${c}px ${c}px`,
            transition: `transform ${dragging ? 90 : 420}ms var(--ease-out-quart)`,
          }}
        >
          {sel === day && (
            <circle
              cx={tx}
              cy={ty}
              r="15"
              fill="none"
              stroke={PHASE_VAR[selPhase]}
              strokeWidth="2"
              className="ring-pulse"
            />
          )}
          <circle cx={tx + 2} cy={ty + 2} r="15" fill="var(--depth-shadow)" />
          <circle
            cx={tx}
            cy={ty}
            r="15"
            fill={sel === day ? "var(--surface)" : PHASE_VAR[selPhase]}
            stroke="var(--fg)"
            strokeWidth="2.5"
          />
          <text
            x={tx}
            y={ty + 4.3}
            textAnchor="middle"
            fontSize="12.5"
            fontWeight="700"
            fill={sel === day ? "var(--fg)" : "var(--surface)"}
            className="tnum"
            style={{
              transform: `rotate(${-deg}deg)`,
              transformOrigin: `${tx}px ${ty}px`,
              transformBox: "view-box",
              transition: `transform ${dragging ? 90 : 420}ms var(--ease-out-quart)`,
            }}
          >
            {sel}
          </text>
        </g>
      </svg>

      {/* El centro: Lilita, y debajo lo que toque contar */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="pointer-events-auto">
          <Lilita mood={sel === day ? mood : PHASE_MOOD[selPhase]} size={58} />
        </div>
        {sel === day ? (
          children
        ) : (
          <div className="mt-0.5 flex flex-col items-center" aria-live="polite">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
              {offset < 0
                ? `Hace ${-offset} ${offset === -1 ? "día" : "días"}`
                : `Dentro de ${offset} ${offset === 1 ? "día" : "días"}`}
            </p>
            <p className="tnum font-display text-[34px] font-extrabold leading-none tracking-[-0.04em]">
              Día {sel}
            </p>
            <p className="mt-0.5 text-[12.5px] font-semibold" style={{ color: PHASE_VAR[selPhase] }}>
              {PHASE_LABEL[selPhase]} · {format(selDate, "d MMM", { locale: es }).replace(".", "")}
            </p>
            <DayFacts
              log={offset <= 0 ? byKey.get(selKey) : undefined}
              future={offset > 0}
              predicted={sel >= predictedFrom && sel <= predictedTo}
              sensitive={!!sensitive && sel >= sensitive.from && sel <= sensitive.to}
              monster={!!monster && sel >= monster.from && sel <= monster.to}
              onOpen={offset < 0 && onOpenDay ? () => onOpenDay(selKey) : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Una línea con lo que hubo (o lo que se espera) ese día. */
function DayFacts({
  log,
  future,
  predicted,
  sensitive,
  monster,
  onOpen,
}: {
  log?: DayLog;
  future: boolean;
  predicted: boolean;
  sensitive: boolean;
  monster: boolean;
  onOpen?: () => void;
}) {
  const facts: string[] = [];
  if (future) {
    if (predicted) facts.push("Regla prevista");
    if (sensitive) facts.push("Semana sensible");
    if (monster) facts.push("Zona monstruo");
  } else {
    const flow = log?.flow ? labelOf(FLOW, log.flow) : undefined;
    if (flow) facts.push(`Regla: ${flow.toLowerCase()}`);
    if (log?.cryEvents?.length) facts.push(`💧 ${log.cryEvents.length}`);
    if (log?.angerEvents?.length) facts.push(`🍪 ${log.angerEvents.length}`);
  }
  const text = facts.length ? facts.join(" · ") : future ? "Nada previsto" : "Nada apuntado";
  if (!onOpen) {
    return <p className="mt-0.5 max-w-[18ch] text-[11.5px] leading-tight text-muted">{text}</p>;
  }
  // Tocar el resumen abre la ficha de ese día.
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onOpen}
      className="pointer-events-auto mt-0.5 max-w-[17ch] py-0.5 text-[11.5px] leading-tight text-muted"
    >
      {facts.length > 0 && <>{facts.join(" · ")} · </>}
      <span className="font-semibold" style={{ color: "var(--accent)" }}>
        Ver el día ›
      </span>
    </button>
  );
}

function Tear({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y - 4.6} C${x + 3.6} ${y - 0.4},${x + 3.2} ${y + 3.6},${x} ${y + 3.6} C${x - 3.2} ${y + 3.6},${x - 3.6} ${y - 0.4},${x} ${y - 4.6}Z`}
      fill="var(--surface)"
    />
  );
}

/** Una galleta diminuta: azul Cookie Monster con sus pepitas. */
function Cookie({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="4.4" fill="var(--cookie)" stroke="var(--surface)" strokeWidth="1.4" />
      <circle cx={x - 1.3} cy={y - 0.9} r="0.85" fill="var(--surface)" />
      <circle cx={x + 1.4} cy={y + 0.7} r="0.85" fill="var(--surface)" />
    </g>
  );
}
