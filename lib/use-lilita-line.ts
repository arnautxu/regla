"use client";

import { useEffect, useState } from "react";
import { contextFingerprint, type LilitaContext } from "./ai-context";
import type { Line } from "./lilita/lines";

/* ═══════════════════════════════════════════════════════════════
   La frase del día, generada.

   Dos cosas que la hacen usable:

   · SE CACHEA POR DÍA. Se guarda junto a una huella del contexto. Si
     abre la app diez veces no se paga diez generaciones, y sobre todo
     el texto no le cambia debajo mientras lo está leyendo. Solo se
     regenera si cambia algo que importa (marca dolor, le baja, pasa
     de día).

   · EL BANCO LOCAL SIGUE AHÍ. Se pinta primero y se sustituye si el
     modelo contesta. Sin red, sin clave o con el gateway caído,
     Lilita habla igual. Una mascota muda por un 502 es una mascota
     rota.

   El ánimo (la cara del SVG) lo sigue decidiendo la lógica local: es
   estado de la app, no una opinión del modelo.
   ═══════════════════════════════════════════════════════════════ */

const KEY = "lilaila:linea";

type Cached = { date: string; fingerprint: string; text: string };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

export function useLilitaLine(
  fallback: Line,
  context: LilitaContext,
  dateKey: string,
  enabled: boolean,
): { line: Line } {
  const [text, setText] = useState<string | null>(null);
  const fingerprint = contextFingerprint(context);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    // Caché y red comparten el mismo flujo asíncrono. Leer la caché
    // y hacer setState aquí mismo, de forma síncrona, encadenaría un
    // render extra en cada montaje; así el estado se actualiza en un
    // microtask igual que si hubiera venido de la red.
    const cached = readCache();
    const hit =
      cached && cached.date === dateKey && cached.fingerprint === fingerprint
        ? cached.text
        : null;

    const source: Promise<string> = hit
      ? Promise.resolve(hit)
      : fetch("/api/lilita", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        })
          .then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
          )
          .then(({ line }: { line: string }) => {
            try {
              localStorage.setItem(
                KEY,
                JSON.stringify({ date: dateKey, fingerprint, text: line }),
              );
            } catch {
              // Almacenamiento lleno o bloqueado: se regenera mañana.
            }
            return line;
          });

    source
      .then((line) => {
        if (alive) setText(line);
      })
      .catch(() => {
        // Se queda el banco local. Nada que contarle a Lídia.
        if (alive) setText(null);
      });

    return () => {
      alive = false;
    };
  }, [enabled, dateKey, fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  return { line: text ? { text, mood: fallback.mood } : fallback };
}
