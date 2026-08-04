"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Lilita } from "./lilita";
import { PERIOD_FLIGHT_DURATION_S } from "@/lib/motion";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReducedMotion() {
  return window.matchMedia(REDUCE_QUERY).matches;
}
function getReducedMotionServer() {
  return false;
}

/* Entra fuera de cuadro abajo a la izquierda, pasa grande y cerca por
   el centro, sale fuera de cuadro arriba a la derecha — el "cerca de
   cámara" de la versión en Three.js, fingido aquí con escala en vez
   de profundidad real. Un sprite 2D no tiene z, pero el ojo lee
   "grande y rápido" como "cerca" igual de bien. */
const TIMES = [0, 0.15, 0.85, 1];
const FLIGHT = {
  x: ["-34vw", "-8vw", "26vw", "46vw"],
  y: ["36vh", "2vh", "-34vh", "-50vh"],
  scale: [0.35, 1.55, 1.3, 0.4],
  rotate: [-25, -2, 14, 30],
  opacity: [0, 1, 1, 0],
};

/* ═══════════════════════════════════════════════════════════════
   Se dispara UNA vez, al confirmar que ha empezado la regla — no en
   cada "Registrar hoy" de los días siguientes, que gastaría la
   broma en un solo día.
   ═══════════════════════════════════════════════════════════════ */

export function PeriodStartFX({
  show,
  onDone,
}: {
  show: boolean;
  onDone: () => void;
}) {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getReducedMotionServer,
  );
  const duration = reduced ? 0.35 : PERIOD_FLIGHT_DURATION_S;

  useEffect(() => {
    if (!show) return;
    // Sin reduce, motion/react ya llama a onDone via onAnimationComplete
    // del sprite; con reduce no hay sprite que lo dispare, así que el
    // temporizador es quien cierra el flash.
    if (!reduced) return;
    const id = setTimeout(onDone, duration * 1000);
    return () => clearTimeout(id);
  }, [show, reduced, duration, onDone]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 55%, var(--accent) 0%, transparent 68%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration, times: [0, 0.32, 1] }}
          />

          {!reduced && (
            <motion.div
              className="absolute left-1/2 top-1/2"
              initial={{
                x: FLIGHT.x[0],
                y: FLIGHT.y[0],
                scale: FLIGHT.scale[0],
                rotate: FLIGHT.rotate[0],
                opacity: 0,
              }}
              animate={FLIGHT}
              transition={{ duration, times: TIMES, ease: "easeInOut" }}
              onAnimationComplete={onDone}
            >
              <Lilita mood="volando" size={132} />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
