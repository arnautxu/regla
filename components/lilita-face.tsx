"use client";

import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { FACES, type Face } from "@/components/lilita";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import type { Mood } from "@/lib/lilita/lines";

/* ═══════════════════════════════════════════════════════════════
   LA CARA DE LILITA, REDONDA

   Lilita sin cuerpo ni patas: solo la cara, llenando el centro del
   anillo. Usa las mismas piezas que components/lilita.tsx (cejas,
   párpados, pupilas y boca), así que cuando cambia de humor no salta
   de una cara a otra: las cejas y la boca se transforman, las pupilas
   se deslizan y la cara entera se aplasta un instante, como al
   recibir la noticia.

   Además de los humores de siempre tiene dos solo para el anillo:
   «llorando» (un día con PAS) y «enfadada» (un día de Cookie
   Monster). Mira hacia el día que se está eligiendo.
   ═══════════════════════════════════════════════════════════════ */

export type FaceMood = Mood | "llorando" | "enfadada";

type FacePart = Pick<Face, "brows" | "pupil" | "lids" | "mouth"> & {
  tear?: boolean;
  steam?: boolean;
};

const EXTRA: Record<"llorando" | "enfadada", FacePart> = {
  /* Cejas caídas hacia fuera, boca al revés y una lágrima. */
  llorando: {
    brows: ["M36 60 Q45 56 54 50", "M84 60 Q75 56 66 50"],
    pupil: { dx: 0, dy: 2, r: 6.5 },
    mouth: { d: "M48 108 Q60 100 72 108" },
    tear: true,
  },
  /* Cejas en V muy marcadas, morro y humo por las orejas. */
  enfadada: {
    brows: ["M34 50 Q45 58 55 63", "M86 50 Q75 58 65 63"],
    pupil: { dx: 0, dy: 1, r: 5 },
    mouth: { d: "M46 108 Q60 98 74 108" },
    steam: true,
  },
};

const partsOf = (m: FaceMood): FacePart =>
  m === "llorando" || m === "enfadada" ? EXTRA[m] : FACES[m];

const MORPH = { duration: DURATION.slow, ease: EASE_OUT_QUART } as const;
const INSTANT = { duration: 0 } as const;
const shapeOf = (d: string) => d.replace(/-?\d*\.?\d+/g, "#");

export function LilitaFace({
  mood,
  look,
  size,
}: {
  mood: FaceMood;
  /** Hacia dónde mira, en radianes (0 = derecha). undefined = al frente */
  look?: number;
  /** Diámetro en px */
  size: number;
}) {
  const reduced = useReducedMotion() ?? false;
  const f = partsOf(mood);
  const morph = reduced ? INSTANT : MORPH;

  /* Aplastar y estirar al cambiar de cara */
  const sx = useMotionValue(1);
  const sy = useMotionValue(1);
  const prev = useRef(mood);
  useEffect(() => {
    if (prev.current === mood || reduced) {
      prev.current = mood;
      return;
    }
    prev.current = mood;
    const opts = { duration: 0.36, times: [0, 0.3, 0.65, 1], ease: "easeOut" as const };
    animate(sy, [1, 0.9, 1.04, 1], opts);
    animate(sx, [1, 1.07, 0.98, 1], opts);
  }, [mood, reduced, sx, sy]);

  /* Parpadeo irregular */
  const blink = useMotionValue(1);
  useEffect(() => {
    if (reduced) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await animate(blink, [1, 0.06, 1], { duration: 0.17, ease: "easeInOut" });
        if (alive) schedule();
      }, 2400 + Math.random() * 4000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [reduced, blink]);

  /* Mirada hacia el día elegido */
  const lx = useSpring(0, { stiffness: 260, damping: 22 });
  const ly = useSpring(0, { stiffness: 260, damping: 22 });
  useEffect(() => {
    lx.set(look === undefined ? 0 : Math.cos(look) * 4);
    ly.set(look === undefined ? 0 : Math.sin(look) * 3.4);
  }, [look, lx, ly]);

  return (
    <motion.svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ overflow: "visible", scaleX: sx, scaleY: sy, originY: 0.9 }}
    >
      <circle cx="60" cy="60" r="57" fill="var(--li-body)" stroke="var(--li-line)" strokeWidth="3" />
      <ellipse cx="33" cy="30" rx="6" ry="11" fill="var(--li-shine)" transform="rotate(-30 33 30)" />

      {/* Las piezas de Lilita están dibujadas para su cuerpo de gota
          (ojos en y = 78); aquí suben para centrarse en el círculo. */}
      <g transform="translate(0 -20)">
        <AnimatePresence initial={false}>
          {f.steam && (
            <motion.g
              key="steam"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
              stroke="var(--li-line)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            >
              <path d="M16 54 q-5 -6 0 -12 q5 -6 0 -12" />
              <path d="M104 54 q5 -6 0 -12 q-5 -6 0 -12" />
            </motion.g>
          )}
        </AnimatePresence>

        <motion.g style={{ scaleY: blink, originX: 0.5, originY: 0.5 }}>
          <ellipse cx="45" cy="78" rx="15.5" ry="16.5" fill="var(--li-sclera)" stroke="var(--li-line)" strokeWidth="3.5" />
          <ellipse cx="75" cy="78" rx="15.5" ry="16.5" fill="var(--li-sclera)" stroke="var(--li-line)" strokeWidth="3.5" />
          <motion.g style={{ x: lx, y: ly }} fill="var(--li-line)">
            {[45, 75].map((cx) => (
              <motion.circle
                key={cx}
                initial={false}
                animate={{ cx: cx + f.pupil.dx, cy: 78 + f.pupil.dy, r: f.pupil.r }}
                transition={morph}
              />
            ))}
          </motion.g>
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

        <g stroke="var(--li-line)" strokeWidth="5" strokeLinecap="round" fill="none">
          {f.brows.map((d, i) => (
            <motion.path key={`b${i}-${shapeOf(d)}`} initial={false} animate={{ d }} transition={morph} />
          ))}
        </g>

        <motion.path
          key={`m-${shapeOf(f.mouth.d)}`}
          initial={reduced ? false : { opacity: 0, d: f.mouth.d }}
          animate={{ d: f.mouth.d, opacity: 1 }}
          transition={morph}
          fill={f.mouth.fill ? "var(--li-line)" : "none"}
          stroke="var(--li-line)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <AnimatePresence initial={false}>
          {f.tear && (
            <motion.path
              key="tear"
              d="M31 92 C36 99 36 104 31 105 C26 104 26 99 31 92Z"
              fill="var(--li-sweat)"
              stroke="var(--li-line)"
              strokeWidth="2.5"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: [ -8, 0, 4, 0 ] }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.6, ease: EASE_OUT_QUART }}
            />
          )}
        </AnimatePresence>
      </g>
    </motion.svg>
  );
}
