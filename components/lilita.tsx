"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
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

   Está viva: al cambiar de humor las piezas se transforman de una
   cara a otra (en vez de saltar) y el cuerpo se aplasta y estira
   como al caer; parpadea a ritmo irregular, mira de reojo, sigue el
   dedo y reacciona a los toques. Diez toques seguidos y se cabrea.
   Todo es SVG + Motion: cero peso extra y cero ilustración nueva.
   ═══════════════════════════════════════════════════════════════ */

type Props = {
  mood?: Mood;
  /** Ancho en px. La altura sale de la proporción. */
  size?: number;
  className?: string;
  /** Mueve la boca como si hablara (p. ej. mientras suena su voz). */
  speaking?: boolean;
};

const BODY = "M60 8 C60 8 98 56 98 88 A38 38 0 1 1 22 88 C22 56 60 8 60 8 Z";

/** Por debajo de este ancho es un icono de cabecera: parpadea, pero
 *  no mira ni atiende toques — a 38 px nadie lo vería y molestaría. */
const LIVELY_MIN_SIZE = 64;

/** Toques seguidos (sin pausa > TAP_GAP_MS) para que se cabree. */
const TANTRUM_TAPS = 10;
const TAP_GAP_MS = 700;
const TANTRUM_MS = 2600;

const MORPH = { duration: DURATION.slow, ease: EASE_OUT_QUART } as const;
const INSTANT = { duration: 0 } as const;

/** Dos trazos con la misma secuencia de comandos se pueden
 *  interpolar; si no, la pieza se cambia de golpe (con la key). */
const shapeOf = (d: string) => d.replace(/-?\d*\.?\d+/g, "#");

export function Lilita({ mood = "neutral", size = 200, className, speaking = false }: Props) {
  const reduced = useReducedMotion() ?? false;
  const lively = !reduced && size >= LIVELY_MIN_SIZE;

  const [tantrum, setTantrum] = useState(false);
  const shown: Mood = tantrum ? "gremlin" : mood;
  const f = FACES[shown];
  const morph = reduced ? INSTANT : MORPH;

  const svgRef = useRef<SVGSVGElement>(null);

  /* --- Aplastar y estirar, con los pies como ancla --------------- */
  const squashX = useMotionValue(1);
  const squashY = useMotionValue(1);
  const squash = (k: number) => {
    const opts = { duration: 0.42, times: [0, 0.28, 0.62, 1], ease: "easeOut" as const };
    animate(squashY, [1, 1 - 0.13 * k, 1 + 0.05 * k, 1], opts);
    animate(squashX, [1, 1 + 0.09 * k, 1 - 0.03 * k, 1], opts);
  };

  // Cada cambio de humor es una reacción visible, no un recambio.
  const prevMood = useRef(shown);
  useEffect(() => {
    if (prevMood.current === shown) return;
    prevMood.current = shown;
    if (!reduced) squash(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, reduced]);

  /* --- Parpadeo: irregular, a veces doble ------------------------ */
  const blink = useMotionValue(1);
  useEffect(() => {
    if (reduced) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const once = () => animate(blink, [1, 0.06, 1], { duration: 0.17, ease: "easeInOut" });
    const schedule = () => {
      timer = setTimeout(async () => {
        await once();
        if (alive && Math.random() < 0.2) await once();
        if (alive) schedule();
      }, 2200 + Math.random() * 4200);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [reduced, blink]);

  /* --- Mirada: sigue el dedo; si nadie toca, mira de reojo ------- */
  const lookX = useSpring(0, { stiffness: 220, damping: 20 });
  const lookY = useSpring(0, { stiffness: 220, damping: 20 });
  useEffect(() => {
    if (!lively) return;
    let lastPointer = 0;
    let release: ReturnType<typeof setTimeout>;
    let glance: ReturnType<typeof setTimeout>;

    const lookAt = (e: PointerEvent) => {
      const el = svgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Centro entre los ojos (y = 78 de 168 en el viewBox).
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + (r.height * 78) / 168);
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 140);
      lookX.set((dx / dist) * reach * 4);
      lookY.set((dy / dist) * reach * 3.2);
      lastPointer = Date.now();
      clearTimeout(release);
      release = setTimeout(() => {
        lookX.set(0);
        lookY.set(0);
      }, 1800);
    };

    const scheduleGlance = () => {
      glance = setTimeout(() => {
        if (Date.now() - lastPointer > 3000 && Math.random() < 0.65) {
          lookX.set((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2));
          lookY.set(Math.random() * 3 - 1.5);
          setTimeout(() => {
            if (Date.now() - lastPointer > 3000) {
              lookX.set(0);
              lookY.set(0);
            }
          }, 700 + Math.random() * 600);
        }
        scheduleGlance();
      }, 3500 + Math.random() * 4500);
    };
    scheduleGlance();

    window.addEventListener("pointermove", lookAt, { passive: true });
    window.addEventListener("pointerdown", lookAt, { passive: true });
    return () => {
      window.removeEventListener("pointermove", lookAt);
      window.removeEventListener("pointerdown", lookAt);
      clearTimeout(release);
      clearTimeout(glance);
    };
  }, [lively, lookX, lookY]);

  /* --- Toques: se encoge; diez seguidos y se cabrea -------------- */
  const taps = useRef({ n: 0, last: 0 });
  const tantrumTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(tantrumTimer.current), []);
  const onTap = () => {
    const now = Date.now();
    const t = taps.current;
    t.n = now - t.last < TAP_GAP_MS ? t.n + 1 : 1;
    t.last = now;
    if (t.n >= TANTRUM_TAPS && !tantrum) {
      t.n = 0;
      setTantrum(true);
      tantrumTimer.current = setTimeout(() => setTantrum(false), TANTRUM_MS);
    } else {
      squash(0.7);
    }
  };

  /* --- Hablar: la boca se abre y cierra a golpes irregulares ----- */
  const talk = useMotionValue(1);
  useEffect(() => {
    if (!speaking || reduced) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      animate(talk, 0.45 + Math.random() * 1.1, { duration: 0.09 });
      timer = setTimeout(() => alive && step(), 90 + Math.random() * 80);
    };
    step();
    return () => {
      alive = false;
      clearTimeout(timer);
      animate(talk, 1, { duration: 0.12 });
    };
  }, [speaking, reduced, talk]);

  const limb = (d: string, i: number, part: string) => (
    <motion.path key={`${part}${i}-${shapeOf(d)}`} initial={false} animate={{ d }} transition={morph} />
  );

  return (
    // Entrada con un pop breve; los cambios de humor posteriores ya
    // no remontan nada: se transforman y se aplastan. Es la única
    // pieza de la app con licencia para "actuar": el resto del
    // chrome se queda quieto a propósito.
    <motion.div
      initial={reduced ? false : { scale: 0.86, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
      className={`inline-block ${className ?? ""}`}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 120 168"
        width={size}
        height={(size * 168) / 120}
        role="img"
        aria-label={`Lilita, ${MOOD_ALT[shown]}`}
        style={{ overflow: "visible", WebkitTapHighlightColor: "transparent" }}
        onPointerDown={lively ? onTap : undefined}
      >
      <g className="lilita-idle" style={{ transformOrigin: "60px 140px" }}>
        <motion.g style={{ scaleX: squashX, scaleY: squashY, originX: 0.5, originY: 1 }}>
        <g
          style={{
            transform: `rotate(${f.tilt}deg)`,
            transformOrigin: "60px 120px",
            transition: reduced ? undefined : `transform ${DURATION.slow}s cubic-bezier(0.25, 1, 0.5, 1)`,
          }}
        >
          {/* --- Piernas y zapatillas -------------------------------
              Doble trazo: uno grueso oscuro debajo y uno fino del
              color del cuerpo encima. Con un solo trazo granate las
              piernas se funden con el fondo oscuro y las zapatillas
              quedan flotando solas. */}
          <g strokeLinecap="round" fill="none">
            <g stroke="var(--li-line)" strokeWidth="10">
              {f.legs.map((d, i) => limb(d, i, "leg-o"))}
            </g>
            <g stroke="var(--li-body)" strokeWidth="5">
              {f.legs.map((d, i) => limb(d, i, "leg-i"))}
            </g>
          </g>
          <g fill="var(--li-shoe)" stroke="var(--li-line)" strokeWidth="3.5" strokeLinejoin="round">
            {f.shoes.map((d, i) => limb(d, i, "shoe"))}
          </g>

          {/* --- Brazos -------------------------------------------- */}
          <g strokeLinecap="round" fill="none">
            <g stroke="var(--li-line)" strokeWidth="10">
              {f.arms.map((d, i) => limb(d, i, "arm-o"))}
            </g>
            <g stroke="var(--li-body)" strokeWidth="5">
              {f.arms.map((d, i) => limb(d, i, "arm-i"))}
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
          <motion.g style={{ scaleY: blink, originX: 0.5, originY: 0.5 }}>
            <ellipse cx="45" cy="78" rx="15.5" ry="16.5" fill="var(--li-sclera)" stroke="var(--li-line)" strokeWidth="3.5" />
            <ellipse cx="75" cy="78" rx="15.5" ry="16.5" fill="var(--li-sclera)" stroke="var(--li-line)" strokeWidth="3.5" />
            <motion.g style={{ x: lookX, y: lookY }} fill="var(--li-line)">
              {[45, 75].map((cx) => (
                <motion.circle
                  key={cx}
                  initial={false}
                  animate={{ cx: cx + f.pupil.dx, cy: 78 + f.pupil.dy, r: f.pupil.r }}
                  transition={morph}
                />
              ))}
            </motion.g>
            {/* Párpados: se dibujan encima para cerrar el ojo por arriba.
                Pueden ir de uno en uno — el guiño de la fase fértil. */}
            <AnimatePresence initial={false}>
              {f.lids?.map(
                (d, i) =>
                  d && (
                    <motion.path
                      key={`lid${i}`}
                      initial={{ opacity: 0, d }}
                      animate={{ opacity: 1, d }}
                      exit={{ opacity: 0 }}
                      transition={morph}
                      fill="var(--li-body)"
                      stroke="var(--li-line)"
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                    />
                  ),
              )}
            </AnimatePresence>
          </motion.g>

          {/* --- Cejas: donde ocurre la actuación ------------------- */}
          <g stroke="var(--li-line)" strokeWidth="5" strokeLinecap="round" fill="none">
            {f.brows.map((d, i) => limb(d, i, "brow"))}
          </g>

          {/* --- Boca ---------------------------------------------- */}
          <motion.g style={{ scaleY: talk, originX: 0.5, originY: 0.3 }}>
            <motion.path
              key={`mouth-${shapeOf(f.mouth.d)}`}
              initial={false}
              animate={{ d: f.mouth.d }}
              transition={morph}
              fill={f.mouth.fill ? "var(--li-line)" : "none"}
              stroke="var(--li-line)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>

          {/* --- Attrezzo ------------------------------------------ */}
          <AnimatePresence initial={false}>
            {f.extra && (
              <motion.g
                key={shown}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: DURATION.quick } }}
                transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
              >
                {f.extra}
              </motion.g>
            )}
          </AnimatePresence>
        </g>
        </motion.g>
      </g>

      <style>{`
        .lilita-idle {
          animation: li-bob 3.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        @keyframes li-bob {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-5px) }
        }
        @media (prefers-reduced-motion: reduce) {
          .lilita-idle { animation: none }
        }
      `}</style>
      </svg>
    </motion.div>
  );
}

/* --- Definición de cada estado de ánimo -------------------------- */

export type Face = {
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

const LEGS_DOWN: [string, string] = ["M48 122 C47.3 129 46.7 136 46 143", "M72 122 C72.7 129 73.3 136 74 143"];
const SHOES_DOWN: [string, string] = [
  "M34 143 h20 a4 4 0 0 1 4 4 v4 a3 3 0 0 1 -3 3 h-21 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z",
  "M66 143 h20 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-21 a3 3 0 0 1 -3 -3 v-4 a4 4 0 0 1 4 -4 z",
];

const ARMS_DOWN: [string, string] = ["M24 96 C14 100 10 108 12 116", "M96 96 C106 100 110 108 108 116"];
const ARMS_UP: [string, string] = ["M24 92 C12 84 8 72 10 60", "M96 92 C108 84 112 72 110 60"];
const ARMS_OUT: [string, string] = ["M24 94 C10 92 4 100 2 108", "M96 94 C110 92 116 100 118 108"];
const ARMS_HUG: [string, string] = ["M26 100 C36 112 52 116 60 114", "M94 100 C84 112 68 116 60 114"];

export const FACES: Record<Mood, Face> = {
  /* Sarcástica de serie: una ceja arriba y media sonrisa. */
  neutral: {
    tilt: 0,
    brows: ["M36 59 Q45 58 54 57", "M70 49 Q77 52 84 55"],
    pupil: { dx: 2, dy: -1, r: 6.5 },
    mouth: { d: "M46 104 Q58 112 76 100" },
    arms: ARMS_DOWN,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
  },

  /* Muerta en vida. Párpados a media asta, boca plana. */
  exhausta: {
    tilt: -4,
    brows: ["M36 61 Q45 57 54 53", "M84 61 Q75 57 66 53"],
    pupil: { dx: 0, dy: 3, r: 6 },
    lids: [
      "M29.5 78 a15.5 16.5 0 0 1 31 0 z",
      "M59.5 78 a15.5 16.5 0 0 1 31 0 z",
    ],
    mouth: { d: "M47 106 Q60 105 73 104" },
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
    legs: ["M48 122 C46.7 128.3 45.3 134.7 44 141", "M72 122 C74 128.3 76 134.7 78 141"],
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
    brows: ["M36 59 Q45 58 54 57", "M70 45 Q78 40 84 48"],
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
    brows: ["M36 51 Q45 56 54 61", "M84 51 Q75 56 66 61"],
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
    brows: ["M36 58 Q45 55.5 54 53", "M84 58 Q75 55.5 66 53"],
    pupil: { dx: 0, dy: 1, r: 7 },
    mouth: { d: "M50 104 Q60 110 70 104" },
    arms: ARMS_HUG,
    legs: LEGS_DOWN,
    shoes: SHOES_DOWN,
  },

  /* Frita. */
  dormida: {
    tilt: -6,
    brows: ["M36 58 Q45 57 54 56", "M84 58 Q75 57 66 56"],
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

  /* Superman, no una interpretación libre: un puño por delante, el
     otro atrás partiendo el viento, piernas juntas a rastra. Solo
     aparece en el vuelo de "me ha bajado" — el resto de la app la ve
     con los pies en el suelo. */
  volando: {
    tilt: -6,
    brows: ["M36 52 Q45 46 54 51", "M84 52 Q75 46 66 51"],
    pupil: { dx: 0, dy: -2, r: 7 },
    mouth: { d: "M46 102 Q58 108 74 100" },
    arms: ["M22 94 C8 82 2 62 6 38", "M98 94 C110 100 118 112 120 128"],
    legs: ["M48 122 C42 136 30 148 20 158", "M72 122 C78 136 90 148 100 158"],
    shoes: [
      "M10 158 h20 a4 4 0 0 1 4 4 v4 a3 3 0 0 1 -3 3 h-21 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z",
      "M90 158 h20 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-21 a3 3 0 0 1 -3 -3 v-4 a4 4 0 0 1 4 -4 z",
    ],
    extra: (
      <g stroke="var(--li-line)" strokeWidth="3" strokeLinecap="round" opacity={0.55}>
        <path d="M100 116 L114 120" />
        <path d="M103 127 L119 129" />
        <path d="M96 105 L108 104" />
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
  volando: "volando como Superman",
  dormida: "dormida",
};
