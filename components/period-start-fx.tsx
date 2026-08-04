"use client";

import { useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";

const PeriodStartScene = dynamic(
  () => import("./period-start-scene").then((m) => m.PeriodStartScene),
  { ssr: false },
);

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

/* ═══════════════════════════════════════════════════════════════
   Se dispara UNA vez, al confirmar que ha empezado la regla — no en
   cada "Registrar hoy" de los días siguientes, que gastaría la
   broma en un solo día. El motor 3D se carga en ese instante
   (dynamic import, sin SSR): la app no lo descarga nunca si no se
   usa, que es el 99% de las sesiones.
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

  useEffect(() => {
    // Con reduce no se monta el motor 3D en absoluto: un flash breve
    // y se acabó. Es lo mismo que ya hace el resto de la app.
    if (!show || !reduced) return;
    const id = setTimeout(onDone, 350);
    return () => clearTimeout(id);
  }, [show, reduced, onDone]);

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
            transition={{ duration: reduced ? 0.35 : 1.5, times: [0, 0.32, 1] }}
          />
          {!reduced && <PeriodStartScene onDone={onDone} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
