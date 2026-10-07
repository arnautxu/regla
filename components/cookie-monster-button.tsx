"use client";

import { useEffect, useRef, useState } from "react";
import {
  addAngerEvent,
  openAnger,
  removeAngerEvent,
  toKey,
  updateAngerEvent,
  type AngerEvent,
  type AngerLevel,
  type DayLog,
} from "@/lib/db";
import { ANGER_LEVELS } from "@/lib/labels";
import { formatMinutes } from "@/lib/episodes";
import { haptic } from "@/lib/use-lilaila";
import { Chips } from "./pas-button";

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
   ═══════════════════════════════════════════════════════════════ */

export function CookieMonsterButton({ days }: { days: DayLog[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
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
      dialog.current?.showModal();
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

  async function setLevel(level: AngerLevel | undefined) {
    if (!event) return;
    haptic(8);
    setEvent({ ...event, level });
    await updateAngerEvent(toKey(new Date(event.at)), event.id, { level }).catch(() => {});
  }

  async function undo() {
    if (!event) return;
    await removeAngerEvent(toKey(new Date(event.at)), event.id).catch(() => {});
    haptic(6);
    dialog.current?.close();
  }

  const label = flash ?? (busy ? "Mandando…" : open ? "Se me ha pasado" : "Cookie Monster");
  const icon = flash ? "🤝" : open ? "🤝" : "🍪";

  return (
    <>
      <button
        type="button"
        onClick={() => void (open ? peace() : angry())}
        disabled={busy}
        className="flat flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold disabled:opacity-60"
        style={{
          background: open ? "var(--cookie-bg)" : "var(--surface)",
          color: flash ? "var(--ok)" : "var(--cookie)",
        }}
      >
        <span aria-hidden="true">{icon}</span>
        <span role="status" aria-live="polite">
          {label}
        </span>
      </button>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="cm-title"
        onClose={() => setEvent(null)}
        onPointerDown={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        {event && (
          <div className="sheet-panel flex flex-col gap-lg px-lg pt-md">
            <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full" style={{ background: "var(--border-strong)" }} />
            <header>
              <h2 id="cm-title" className="font-display text-lg font-bold">
                {busy ? "Avisando a Arnau…" : sendError ? "Apuntado, pero sin aviso" : "🍪 Arnau ya lo sabe"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {sendError
                  ? `${sendError} El enfado queda guardado igual.`
                  : "Cuando se te pase, toca «Se me ha pasado» en Hoy y le llega la paz."}
              </p>
            </header>

            <Chips
              legend="¿Cuánto monstruo hoy?"
              options={ANGER_LEVELS}
              value={event.level}
              onChange={(level) => void setLevel(level)}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void undo()}
                className="min-h-[52px] flex-1 rounded-full font-semibold"
                style={{ background: "var(--bg)", boxShadow: "var(--depth-sm)" }}
              >
                Deshacer
              </button>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="min-h-[52px] flex-[1.5] rounded-full font-display font-bold"
                style={{ background: "var(--accent)", color: "var(--on-accent)", boxShadow: "3px 3px 0 0 var(--depth-shadow)" }}
              >
                Listo
              </button>
            </div>
            {!sendError && !busy && (
              <p className="-mt-sm text-center text-xs text-faint">
                «Deshacer» lo borra de aquí; el aviso a Arnau ya ha salido.
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
