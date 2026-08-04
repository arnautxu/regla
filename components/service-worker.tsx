"use client";

import { useEffect } from "react";
import { setPill } from "@/lib/db";

/** Registra el service worker. Sin él, iOS no da push ni offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Si falla, la app sigue funcionando online. No hay nada que
        // decirle a Lídia sobre esto.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  /* Cuando marca la pastilla desde el aviso, el worker escribe en
     IndexedDB a pelo. Dexie no ve esa escritura —sus liveQuery se
     avisan entre sí, no espían la base—, así que con la app abierta
     la pantalla se quedaba con el dato viejo hasta recargar.

     Se reescribe lo mismo a través de Dexie: es idempotente, repinta
     todo lo que dependa del día y de paso dispara la copia de
     seguridad, que el worker tampoco puede lanzar. */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; date?: string; at?: string };
      if (msg?.type !== "pastilla-tomada" || !msg.date) return;
      void setPill(msg.date, true, msg.at ? new Date(msg.at) : new Date());
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  return null;
}
