/* ═══════════════════════════════════════════════════════════════
   MOTION

   Los mismos números que --ease-out-quart/--spacing en globals.css,
   para que el CSS (sticker, sheet-up) y el JS (motion/react) se
   muevan con la misma personalidad: pegatina de papel, no vidrio.
   Sin rebote — un objeto de papel llega y para, no bota.
   ═══════════════════════════════════════════════════════════════ */

/** Igual que --ease-out-quart en app/globals.css. */
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export const DURATION = {
  /** Chips, feedback de un toque. */
  quick: 0.16,
  /** Tarjetas, mensajes, pasos de asistente. */
  standard: 0.22,
  /** Cambio de pantalla, hoja modal. */
  slow: 0.32,
} as const;
