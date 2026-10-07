"use client";

import { useEffect, useState } from "react";
import {
  addAngerEvent,
  openAnger,
  removeAngerEvent,
  toKey,
  updateAngerEvent,
  type AngerEvent,
  type DayLog,
} from "@/lib/db";
import { ANGER_LEVELS, ANGER_NEEDS, ANGER_REASONS, labelOf } from "@/lib/labels";
import { formatMinutes } from "@/lib/episodes";
import { haptic } from "@/lib/use-lilaila";
import {
  REACCION_ENFADO_MOTIVO,
  REACCION_ENFADO_NECESITA,
  REACCION_ENFADO_NIVEL,
} from "@/lib/lilita/reacciones";
import { EpisodioSheet, UnaOpcion } from "./episodio-sheet";

/* ═══════════════════════════════════════════════════════════════
   COOKIE MONSTER

   El «estoy enfadada contigo» de Lídia a Arnau (que le dice que se
   parece al monstruo de las galletas). El toque sigue mandándole el
   aviso, y además el enfado queda apuntado aquí, en su móvil, para
   poder ver cuándo pasan y cuánto duran.

   Mientras hay un enfado abierto, el botón pasa a ser «Ya se me ha
   pasado»: lo cierra y le manda a Arnau el aviso de paz.

   Si el aviso falla, el enfado se apunta igual: lo que pasó, pasó,
   aunque no haya cobertura.

   Lo de después va por pasos, como la hoja del día: cuánto
   monstruo, qué ha pasado y qué le haría falta, una pregunta cada
   vez y con Lilita echando leña. Todo se queda en su móvil: a Arnau
   solo le llega el aviso, como siempre.
   ═══════════════════════════════════════════════════════════════ */

export function CookieMonsterButton({ days }: { days: DayLog[] }) {
  const [abierta, setAbierta] = useState(false);
  const [event, setEvent] = useState<AngerEvent | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const open = openAnger(days);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  async function post(url: string, body?: object): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok ? null : (data.error ?? "No he podido mandar el aviso.");
    } catch {
      return "Sin conexión: el aviso no ha salido.";
    }
  }

  async function angry() {
    if (busy) return;
    setBusy(true);
    haptic(16);
    const fresh: AngerEvent = { id: crypto.randomUUID(), at: new Date().toISOString() };
    try {
      await addAngerEvent(fresh);
      setEvent(fresh);
      setSendError(null);
      setAbierta(true);
      const error = await post("/api/cookie-monster");
      setSendError(error);
      haptic(error ? [40, 50, 40] : [14, 40, 18]);
    } finally {
      setBusy(false);
    }
  }

  async function peace() {
    if (busy || !open) return;
    setBusy(true);
    const ended = new Date();
    const minutes = (ended.getTime() - new Date(open.event.at).getTime()) / 60000;
    try {
      await updateAngerEvent(open.date, open.event.id, { endedAt: ended.toISOString() });
      haptic([10, 30, 10, 30, 10]);
      const error = await post("/api/cookie-monster/paz", { minutes });
      setFlash(error ? "Paz apuntada" : `Paz · ${formatMinutes(Math.max(1, minutes))}`);
    } finally {
      setBusy(false);
    }
  }

  function patch(p: Partial<Omit<AngerEvent, "id" | "at">>) {
    if (!event) return;
    setEvent({ ...event, ...p });
    void updateAngerEvent(toKey(new Date(event.at)), event.id, p).catch(() => {});
  }

  async function undo() {
    if (!event) return;
    await removeAngerEvent(toKey(new Date(event.at)), event.id).catch(() => {});
  }

  const label = flash ?? (busy ? "Mandando…" : open ? "Se me ha pasado" : "Cookie Monster");
  const icon = flash ? "🤝" : open ? "🤝" : "🍪";

  return (
    <>
      <button
        type="button"
        onClick={() => void (open ? peace() : angry())}
        disabled={busy}
        className="flat quick-btn disabled:opacity-60"
        style={{
          background: open ? "var(--cookie-bg)" : "var(--surface)",
          color: flash ? "var(--ok)" : "var(--cookie)",
        }}
      >
        <span aria-hidden="true" className="text-lg leading-none">{icon}</span>
        <span role="status" aria-live="polite">
          {label}
        </span>
      </button>

      <EpisodioSheet
        abierta={abierta && !!event}
        label="Cookie Monster"
        cara="enfadada"
        titulo={busy ? "Avisando a Arnau…" : sendError ? "Apuntado, pero sin aviso" : "🍪 Arnau ya lo sabe"}
        subtitulo={
          sendError
            ? `${sendError} El enfado queda guardado igual.`
            : "Ahora cuéntame a mí. Solo si quieres."
        }
        celebra="Expediente completo. Arnau, tiembla."
        aviso={
          sendError
            ? undefined
            : "Cuando se te pase, toca «Se me ha pasado» en Hoy. «Deshacer» lo borra de aquí; el aviso a Arnau ya ha salido."
        }
        onDeshacer={() => void undo()}
        onCerrar={() => setAbierta(false)}
        pasos={[
          {
            id: "nivel",
            nombre: "Cuánto",
            titulo: "¿Cuánto monstruo?",
            hecho: event?.level !== undefined,
            valor: labelOf(ANGER_LEVELS, event?.level),
            render: (contestada) => (
              <UnaOpcion
                label="Cuánto monstruo"
                options={ANGER_LEVELS}
                value={event?.level}
                onChange={(v) => {
                  patch({ level: v });
                  contestada(v === undefined ? null : REACCION_ENFADO_NIVEL[v]);
                }}
              />
            ),
          },
          {
            id: "motivo",
            nombre: "Por qué",
            titulo: "¿Qué ha hecho esta vez?",
            ayuda: "O qué no ha hecho, que también cuenta.",
            hecho: event?.reason !== undefined,
            valor: labelOf(ANGER_REASONS, event?.reason),
            render: (contestada) => (
              <UnaOpcion
                label="Qué ha pasado"
                options={ANGER_REASONS}
                value={event?.reason}
                onChange={(v) => {
                  patch({ reason: v });
                  contestada(v === undefined ? null : REACCION_ENFADO_MOTIVO[v]);
                }}
              />
            ),
          },
          {
            id: "necesita",
            nombre: "Qué necesitas",
            titulo: "¿Qué te haría falta?",
            ayuda: "Para que se te pase antes.",
            hecho: event?.need !== undefined,
            valor: labelOf(ANGER_NEEDS, event?.need),
            render: (contestada) => (
              <UnaOpcion
                label="Qué te haría falta"
                options={ANGER_NEEDS}
                value={event?.need}
                onChange={(v) => {
                  patch({ need: v });
                  contestada(v === undefined ? null : REACCION_ENFADO_NECESITA[v]);
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}
