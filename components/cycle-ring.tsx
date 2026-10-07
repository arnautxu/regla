import { phaseByDay, type Phase } from "@/lib/cycle";

/* ═══════════════════════════════════════════════════════════════
   EL ANILLO DEL CICLO

   El ciclo entero como un reloj: un segmento por día, teñido con su
   fase, empezando arriba en el día 1 y girando como las agujas. Lo
   que ya pasó va en tinta plena; lo que queda, en tenue. El día de
   hoy lleva su número en una chapa.

   La regla prevista es un arco DISCONTINUO por fuera del anillo, del
   primer al último día del rango. Es la misma jerarquía de certeza
   del calendario: lo registrado es trazo pleno, lo calculado no.

   Si va con retraso, el anillo crece con los días de más (en tono de
   regla tenue) en vez de dar la vuelta y fingir un día 1 que no ha
   llegado.
   ═══════════════════════════════════════════════════════════════ */

const PHASE_VAR: Record<Phase, string> = {
  menstrual: "var(--ph-menstrual)",
  folicular: "var(--ph-folicular)",
  ovulacion: "var(--ph-ovulacion)",
  lutea: "var(--ph-lutea)",
};

export function CycleRing({
  day,
  length,
  periodLength,
  bleeding,
  range,
  size = 264,
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
  size?: number;
  children?: React.ReactNode;
}) {
  const total = Math.max(length, day);
  const c = size / 2;
  const r = c - 26;
  const gap = 1.8 / r; // ~1.8px de aire entre segmentos

  const angle = (d: number) => -Math.PI / 2 + (d / total) * 2 * Math.PI;
  const at = (a: number, radius = r) =>
    [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const;
  const arc = (from: number, to: number, radius = r) => {
    const [x0, y0] = at(from, radius);
    const [x1, y1] = at(to, radius);
    const large = to - from > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  const segments = Array.from({ length: total }, (_, i) => {
    const d = i + 1;
    // Días de más por retraso, o regla que sigue más allá de lo
    // habitual: manda lo que pasa, no la media.
    const phase: Phase =
      d > length || (bleeding && d <= day && d > periodLength)
        ? "menstrual"
        : phaseByDay(d, length, periodLength);
    return { d, phase };
  });

  // El arco de la regla prevista, solo si no va con retraso: con
  // retraso ya no hay rango que dibujar, hay días que se acumulan.
  let predicted: string | null = null;
  if (range && day <= length) {
    const from = day + Math.max(range.earliest, 1) - 1;
    const to = day + Math.max(range.latest, 1);
    predicted = arc(angle(from), angle(to), r + 17);
  }

  const [tx, ty] = at(angle(day - 0.5));

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
        className="absolute inset-0"
      >
        {segments.map(({ d, phase }) => (
          <path
            key={d}
            d={arc(angle(d - 1) + gap, angle(d) - gap)}
            fill="none"
            stroke={PHASE_VAR[phase]}
            strokeWidth={d === day ? 18 : 13}
            opacity={d <= day ? 1 : 0.26}
          />
        ))}
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
        <circle
          cx={tx}
          cy={ty}
          r="14"
          fill="var(--surface)"
          stroke="var(--fg)"
          strokeWidth="2.5"
        />
        <text
          x={tx}
          y={ty + 4.2}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="var(--fg)"
          className="tnum"
        >
          {day}
        </text>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
