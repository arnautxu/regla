import { useSyncExternalStore } from "react";

/* ═══════════════════════════════════════════════════════════════
   TOUR DE BIENVENIDA

   Tres tarjetas justo después del onboarding, y nunca más. Lo marca
   el propio onboarding al terminar: quien ya usaba la app (Lídia,
   con meses de datos) nunca pasa por ahí, así que no le sale.
   ═══════════════════════════════════════════════════════════════ */

const KEY = "lilaila:tour-pendiente";
const listeners = new Set<() => void>();

function leer(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function avisar() {
  listeners.forEach((l) => l());
}

export function marcarTourPendiente() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Sin almacenamiento no hay tour, y tampoco pasa nada.
  }
  avisar();
}

export function cerrarTour() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  avisar();
}

export function useTourPendiente(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    leer,
    () => false,
  );
}
