"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  addCryEvent,
  removeCryEvent,
  toKey,
  updateCryEvent,
  type CryEvent,
  type CryReason,
} from "@/lib/db";
import { CRY_INTENSITIES, CRY_REASONS } from "@/lib/labels";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   PAS · HE LLORADO

   Guardar primero, preguntar después. Antes el botón abría un
   formulario que no dejaba guardar sin elegir motivo: llorando no
   apetece rellenar nada, y el PAS que no se apunta no existe para
   los patrones. Ahora un toque guarda hora, día y fase, y la hoja
   que se abre es para añadir lo que quiera, cuando quiera. Cada chip
   se guarda al tocarlo; «Deshacer» lo borra si fue sin querer.

   Nada de esto sale del móvil: el PAS no entra en el chat de Lilita
   ni en la llamada.
   ═══════════════════════════════════════════════════════════════ */

export function PasButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [event, setEvent] = useState<CryEvent | null>(null);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");

  // La confirmación vive en el propio botón y se va sola.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  async function cry() {
    haptic([12, 35, 12]);
    const fresh: CryEvent = { id: crypto.randomUUID(), at: new Date().toISOString() };
    setError("");
    try {
      await addCryEvent(fresh);
      setEvent(fresh);
      setNote("");
      setFlash(true);
      dialog.current?.showModal();
    } catch {
      setError("No se ha podido guardar. Inténtalo otra vez.");
    }
  }

  async function patch(p: Partial<Omit<CryEvent, "id" | "at">>) {
    if (!event) return;
    const next = { ...event, ...p };
    setEvent(next);
    haptic(8);
    await updateCryEvent(toKey(new Date(event.at)), event.id, p).catch(() =>
      setError("No se ha podido guardar el cambio."),
    );
  }

  async function close() {
    if (event && note.trim() !== (event.note ?? "")) {
      await patch({ note: note.trim() || undefined });
    }
    dialog.current?.close();
  }

  async function undo() {
    if (!event) return;
    await removeCryEvent(toKey(new Date(event.at)), event.id).catch(() => {});
    haptic(6);
    setFlash(false);
    setEvent(null);
    dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void cry()}
        className="flat flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold"
        style={{ background: "var(--surface)", color: flash ? "var(--ok)" : error ? "var(--accent)" : "var(--fg)" }}
      >
        <span aria-hidden="true">{flash ? "✓" : "💧"}</span>
        <span role="status">{flash ? "PAS guardado" : error ? "No ha salido" : "He llorado"}</span>
      </button>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="pas-title"
        onClose={() => setEvent(null)}
        onPointerDown={(e) => {
          if (e.target === dialog.current) void close();
        }}
      >
        {event && (
          <div className="sheet-panel flex flex-col gap-lg px-lg pt-md">
            <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full" style={{ background: "var(--border-strong)" }} />
            <header>
              <h2 id="pas-title" className="font-display text-lg font-bold">
                PAS guardado a las {format(new Date(event.at), "HH:mm")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Ya está apuntado. Si quieres, cuenta algo más; si no, ciérralo y listo.
              </p>
            </header>

            <Chips
              legend="¿Qué crees que lo provocó?"
              options={CRY_REASONS}
              value={event.reason}
              onChange={(reason: CryReason | undefined) => void patch({ reason })}
            />
            <Chips
              legend="¿Cómo fue?"
              options={CRY_INTENSITIES}
              value={event.intensity}
              onChange={(intensity) => void patch({ intensity })}
            />

            <div>
              <label htmlFor="pas-note" className="text-sm font-semibold">
                ¿Quieres añadir algo más?
              </label>
              <textarea
                id="pas-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Qué pasó, cómo te sentías…"
                className="mt-2 w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: "var(--bg)", boxShadow: "var(--depth-sm)" }}
              />
            </div>

            {error && <p className="text-sm" style={{ color: "var(--accent)" }} role="alert">{error}</p>}
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
                onClick={() => void close()}
                className="min-h-[52px] flex-[1.5] rounded-full font-display font-bold"
                style={{ background: "var(--accent)", color: "var(--on-accent)", boxShadow: "3px 3px 0 0 var(--depth-shadow)" }}
              >
                Listo
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/** Fila de chips de una sola elección. Tocar el marcado lo desmarca. */
export function Chips<T extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">
        {legend} <span className="font-normal text-faint">Opcional</span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? undefined : option.value)}
              className="min-h-11 rounded-full px-4 text-sm font-semibold transition-colors"
              style={{
                background: on ? "var(--accent)" : "var(--bg)",
                color: on ? "var(--on-accent)" : "var(--fg)",
                boxShadow: "var(--depth-sm)",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
