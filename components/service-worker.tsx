"use client";

import { useEffect } from "react";

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

  return null;
}
