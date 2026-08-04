"use client";

import { motion } from "motion/react";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import type { Mood } from "@/lib/lilita/lines";

/* ═══════════════════════════════════════════════════════════════
   LILITA

   Una gota de sangre con patas. Construida por capas para que la
   cara se pueda actuar sin recargar nada: cejas, párpados, pupilas
   y boca son piezas independientes.

   Es siempre roja, en todas las fases. El acento de la app cambia;
   ella no. Una mascota que cambia de color deja de ser un personaje
   y pasa a ser un icono de estado.
   ═══════════════════════════════════════════════════════════════ */

type Props = {
  mood?: Mood;
  /** Ancho en px. La altura sale de la proporción. */
  size?: number;
  className?: string;
};

const BODY = "M60 8 C60 8 98 56 98 88 A38 38 0 1 1 22 88 C22 56 60 8 60 8 Z";

export function Lilita({ mood = "neutral", size = 200, className }: Props) {
  const f = FACES[mood];

  return (
    // key={mood}: al cambiar de humor, el bloque se remonta entero y
    // entra con un pop breve — la reacción se nota sin depender de
    // que alguien esté mirando la cara en el momento exacto en que
    // cambia. Es la única pieza de la app con licencia para "actuar":
    // el resto del chrome se queda quieto a propósito.
    <motion.div
      key={mood}
      initial={{ scale: 0.86, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
      className={`inline-block ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 120 168"
        width={size}
        height={(size * 168) / 120}
        role="img"
        aria-label={`Lilita, ${MOOD_ALT[mood]}`}
        style={{ overflow: "visible" }}
      >
      <g className="lilita-idle" style={{ transformOrigin: "60px 140px" }}>
        <g style={{ transform: `rotate(${f.tilt}deg)`, transformOrigin: "60px 120px" }}>
          {/* --- Piernas y zapatillas -------------------------------
              Doble trazo: uno grueso oscuro debajo y uno fino del
              color del cuerpo encima. Con un solo trazo granate las
              piernas se funden con el fondo oscuro y las zapatillas
              quedan flotando solas. */}
          <g strokeLinecap="round" fill="none">
            <g stroke="var(--li-line)" strokeWidth="10">
              <path d={f.legs[0]} />
              <path d={f.legs[1]} />
            </g>
            <g stroke="var(--li-body)" strokeWidth="5">
              <path d={f.legs[0]} />
              <path d={f.legs[1]} />
            </g>
          </g>
          <g fill="var(--li-shoe)" stroke="var(--li-line)" strokeWidth="3.5" strokeLinejoin="round">
            <path d={f.shoes[0]} />
            <path d={f.shoes[1]} />
          </g>

          {/* --- Brazos -------------------------------------------- */}
          <g strokeLinecap="round" fill="none">
            <g stroke="var(--li-line)" strokeWidth="10">
              <path d={f.arms[0]} />
              <path d={f.arms[1]} />
            </g>
            <g stroke="var(--li-body)" strokeWidth="5">
              <path d={f.arms[0]} />
              <path d={f.arms[1]} />
            </g>
          </g>

          {/* --- Cuerpo -------------------------------------------- */}
          <path
            d={BODY}
            fill="var(--li-body)"
            stroke="var(--li-line)"
            strokeWidth="4"
          />
          {/* Brillo: un solo destello, arriba a la izquierda, como en
              una gota de verdad. Sin degradados. */}
          <ellipse cx="44" cy="52" rx="7" ry="12" fill="var(--li-shine)" transform="rotate(-18 44 52)" />

          {/* --- Ojos ---------------------------------------------- */}
          <g className="lilita-blink">
            <ellipse cx="45" cy="78" rx="15.5" ry="16.5" fill="var(--li-sclera)" stroke="var(--li-line)" strokeWidth="3.5" />
            <ellipse cx="75" cy="78" rx="15.5" ry="16.5" fill="var(--li-sclera)" stroke="var(--li-line)" strokeWidth="3.5" />
            <circle cx={45 + f.pupil.dx} cy={78 + f.pupil.dy} r={f.pupil.r} fill="var(--li-line)" />
            <circle cx={75 + f.pupil.dx} cy={78 + f.pupil.dy} r={f.pupil.r} fill="var(--li-line)" />
            {/* Párpados: se dibujan encima para cerrar el ojo por arriba.
                Pueden ir de uno en uno — el guiño de la fase fértil. */}
            {f.lids?.[0] && (
              <path d={f.lids[0]} fill="var(--li-body)" stroke="var(--li-line)" strokeWidth="3.5" strokeLinejoin="round" />
            )}
            {f.lids?.[1] && (
              <path d={f.lids[1]} fill="var(--li-body)" stroke="var(--li-line)" strokeWidth="3.5" strokeLinejoin="round" />
            )}
          </g>

          {/* --- Cejas: donde ocurre la actuación ------------------- */}
          <g stroke="var(--li-line)" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d={f.brows[0]} />
            <path d={f.brows[1]} />
          </g>

          {/* --- Boca ---------------------------------------------- */}
          <path
            d={f.mouth.d}
            fill={f.mouth.fill ? "var(--li-line)" : "none"}
            stroke="var(--li-line)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* --- Attrezzo ------------------------------------------ */}
          {f.extra}
        </g>
      </g>

      <style>{`
        .lilita-idle {
          animation: li-bob 3.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .lilita-blink {
          transform-box: fill-box;
          transform-origin: center;
          animation: li-blink 5.6s linear infinite;
        }
        @keyframes li-bob {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-5px) }
        }
        @keyframes li-blink {
          0%, 93%, 100% { transform: scaleY(1) }
          96% { transform: scaleY(0.06) }
        }
        @media (prefers-reduced-motion: reduce) {
          .lilita-idle, .lilita-blink { animation: none }
        }
      `}</style>
      </svg>
    </motion.div>
  );
}

/* --- Definición de cada estado de ánimo -------------------------- */

type Face = {
  tilt: number;
  brows: [string, string];
  pupil: { dx: number; dy: number; r: number };
  lids?: [string | null, string | null];
  mouth: { d: string; fill?: boolean };
  arms: [string, string];
  legs: [string, string];
  shoes: [string, string];
  extra?: React.ReactNode;
};

const LEGS_DOWN: [string, string] = ["M48 122 L46 143", "M72 122 L74 143"];
const SHOES_DOWN: [string, string] = [
  "M34 143 h20 a4 4 0 0 1 4 4 v4 a3 3 0 0 1 -3 3 h-21 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z",
  "M66 143 h20 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-21 a3 3 0 0 1 -3 -3 v-4 a4 4 0 0 1 4 -4 z",
];

const ARMS_DOWN: [string, string] = ["M24 96 C14 100 10 108 12 116", "M96 96 C106 100 110 108 108 116"];
const ARMS_UP: [string, string] = ["M24 92 C12 84 8 72 10 60", "M96 92 C108 84 112 72 110 60"];
const ARMS_OUT: [string, string] = ["M24 94 C10 92 4 100 2 108", "M96 94 C110 92 116 100 118 108"];
const ARMS_HUG: [string, string] = ["M26 100 C36 112 52 116 60 114", "M94 100 C84 112 68 116 60 114"];

const FACES: Record<Mood, Face> = {
  /* Sarcástica de serie: una ceja arriba y media sonrisa. */
  neutral: {
    tilt: 0,
    brows: ["M36 59 L54 57", "M70 49 L84 55"],
    pupil: { dx: 2, dy: -1, r: 6.5 },
    mouth: { d: "M46 104 Q58 112 76 100" },
    arms: ARMS_DOWN,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
  },

  /* Muerta en vida. Párpados a media asta, boca plana. */
  exhausta: {
    tilt: -4,
    brows: ["M36 61 L54 53", "M84 61 L66 53"],
    pupil: { dx: 0, dy: 3, r: 6 },
    lids: [
      "M29.5 78 a15.5 16.5 0 0 1 31 0 z",
      "M59.5 78 a15.5 16.5 0 0 1 31 0 z",
    ],
    mouth: { d: "M47 106 L73 104" },
    arms: ["M24 98 C14 104 12 112 14 120", "M96 98 C106 104 108 112 106 120"],
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
  },

  /* Insoportablemente animada. */
  energica: {
    tilt: 3,
    brows: ["M36 54 Q45 47 54 52", "M84 54 Q75 47 66 52"],
    pupil: { dx: 0, dy: -2, r: 7.5 },
    mouth: { d: "M42 98 Q60 124 78 98 Z", fill: true },
    arms: ARMS_UP,
    legs: ["M48 122 L44 141", "M72 122 L78 141"],
    shoes: [
      "M32 141 h20 a4 4 0 0 1 4 4 v4 a3 3 0 0 1 -3 3 h-21 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z",
      "M68 141 h20 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-21 a3 3 0 0 1 -3 -3 v-4 a4 4 0 0 1 4 -4 z",
    ],
    extra: (
      <g stroke="var(--li-line)" strokeWidth="3.5" strokeLinecap="round">
        <path d="M8 44 L2 38" />
        <path d="M14 34 L11 26" />
        <path d="M112 44 L118 38" />
        <path d="M106 34 L109 26" />
      </g>
    ),
  },

  /* Una ceja hasta el techo, un ojo entornado, sonrisa torcida. */
  flirty: {
    tilt: 2,
    brows: ["M36 59 L54 57", "M70 45 Q78 40 84 48"],
    pupil: { dx: 4, dy: 0, r: 6.5 },
    lids: ["M29.5 74 a15.5 16.5 0 0 1 31 0 z", null],
    mouth: { d: "M44 106 Q56 110 78 96" },
    arms: ARMS_HUG,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
  },

  /* Cejas en V, dientes apretados. No razona. */
  gremlin: {
    tilt: -2,
    brows: ["M36 51 L54 61", "M84 51 L66 61"],
    pupil: { dx: 0, dy: 1, r: 5 },
    mouth: {
      d: "M42 100 h36 v10 h-36 z M50 100 v10 M58 100 v10 M66 100 v10",
    },
    arms: ARMS_OUT,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
    extra: (
      <g stroke="var(--li-line)" strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M96 30 q6 -5 12 0 M96 38 q6 -5 12 0" />
      </g>
    ),
  },

  /* Ojos enormes, pupilas diminutas, boca temblando. */
  panico: {
    tilt: 0,
    brows: ["M36 49 Q45 44 54 48", "M84 49 Q75 44 66 48"],
    pupil: { dx: 0, dy: 0, r: 3.5 },
    mouth: { d: "M44 104 q6 -7 12 0 t12 0" },
    arms: ["M24 94 C16 84 18 74 26 70", "M96 94 C104 84 102 74 94 70"],
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
    extra: (
      <g fill="var(--li-sweat)" stroke="var(--li-line)" strokeWidth="2.5">
        <path d="M100 58 C100 58 106 68 106 72 a6 6 0 0 1 -12 0 c0 -4 6 -14 6 -14 z" />
      </g>
    ),
  },

  /* Modo cuidados: sin ironía. Ojos blandos, sonrisa mínima. */
  cuidando: {
    tilt: -3,
    brows: ["M36 58 L54 53", "M84 58 L66 53"],
    pupil: { dx: 0, dy: 1, r: 7 },
    mouth: { d: "M50 104 Q60 110 70 104" },
    arms: ARMS_HUG,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
  },

  /* Frita. */
  dormida: {
    tilt: -6,
    brows: ["M36 58 L54 56", "M84 58 L66 56"],
    pupil: { dx: 0, dy: 0, r: 0 },
    lids: [
      "M29.5 78 a15.5 16.5 0 0 1 31 0 z",
      "M59.5 78 a15.5 16.5 0 0 1 31 0 z",
    ],
    mouth: { d: "M54 104 a6 5 0 1 0 12 0 a6 5 0 1 0 -12 0" },
    arms: ARMS_DOWN,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
    extra: (
      <g fill="var(--li-line)" fontFamily="var(--font-display)" fontWeight="700">
        <text x="98" y="40" fontSize="16">z</text>
        <text x="108" y="26" fontSize="12">z</text>
      </g>
    ),
  },
};

const MOOD_ALT: Record<Mood, string> = {
  neutral: "con una ceja levantada",
  exhausta: "agotada",
  energica: "dando saltos",
  flirty: "con cara pícara",
  gremlin: "furiosa",
  panico: "en pánico",
  cuidando: "cuidándote",
  dormida: "dormida",
};
