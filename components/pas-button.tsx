"use client";

import { useEffect, useRef, useState } from "react";
import { addCryEvent, type CryEvent, type CryReason } from "@/lib/db";
import { CRY_INTENSITIES, CRY_REASONS } from "@/lib/labels";
import { haptic } from "@/lib/use-lilaila";

export function PasButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const [at, setAt] = useState("");
  const [reason, setReason] = useState<CryReason | null>(null);
  const [intensity, setIntensity] = useState<CryEvent["intensity"]>();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (opened && !el.open) el.showModal();
    if (!opened && el.open) el.close();
  }, [opened]);

  function open() {
    haptic(12);
    setAt(new Date().toISOString());
    setReason(null);
    setIntensity(undefined);
    setNote("");
    setError("");
    setMessage("");
    setOpened(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason || saving) return;
    setSaving(true);
    setError("");
    try {
      await addCryEvent({
        id: crypto.randomUUID(),
        at,
        reason,
        intensity,
        note: note.trim() || undefined,
      });
      haptic([12, 35, 12]);
      setMessage("PAS guardado en el calendario.");
      dialog.current?.close();
    } catch {
      setError("No se ha podido guardar. Inténtalo otra vez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="sticker rounded-2xl px-lg py-md" style={{ background: "var(--surface)" }}>
        <p className="text-sm text-muted">¿Has llorado? Puedes apuntar qué pasó.</p>
        <button
          type="button"
          onClick={open}
          className="mt-3 w-full rounded-full px-lg py-3.5 font-display text-base font-bold transition-transform duration-150 active:scale-[0.975]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)", boxShadow: "3px 3px 0 0 var(--depth-shadow)" }}
        >
          💧 PAS · He llorado
        </button>
        {message && <p className="mt-2 text-xs text-faint" role="status">{message}</p>}
      </section>

      <dialog
        ref={dialog}
        className="sheet"
        aria-labelledby="pas-title"
        onClose={() => setOpened(false)}
        onPointerDown={(event) => {
          if (event.target === dialog.current && !saving) dialog.current?.close();
        }}
      >
        <form onSubmit={(event) => void save(event)} className="sheet-panel flex flex-col gap-lg px-lg pt-md">
          <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full" style={{ background: "var(--border-strong)" }} />
          <header>
            <h2 id="pas-title" className="font-display text-lg font-bold">PAS · Has llorado</h2>
            <p className="mt-1 text-sm text-muted">Lo guardaré en el día en que pasó. Cuenta solo lo que quieras.</p>
          </header>

          <fieldset>
            <legend className="text-sm font-semibold">¿Qué crees que lo provocó?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CRY_REASONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={reason === option.value}
                  onClick={() => setReason(option.value)}
                  className="min-h-11 rounded-full px-4 text-sm font-semibold transition-colors"
                  style={{
                    background: reason === option.value ? "var(--accent)" : "var(--bg)",
                    color: reason === option.value ? "var(--on-accent)" : "var(--fg)",
                    boxShadow: "var(--depth-sm)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">¿Cómo fue? <span className="font-normal text-faint">Opcional</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CRY_INTENSITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={intensity === option.value}
                  onClick={() => setIntensity(intensity === option.value ? undefined : option.value)}
                  className="min-h-11 rounded-full px-4 text-sm font-semibold transition-colors"
                  style={{
                    background: intensity === option.value ? "var(--accent)" : "var(--bg)",
                    color: intensity === option.value ? "var(--on-accent)" : "var(--fg)",
                    boxShadow: "var(--depth-sm)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="pas-note" className="text-sm font-semibold">¿Quieres añadir algo más? <span className="font-normal text-faint">Opcional</span></label>
            <textarea
              id="pas-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Qué pasó, cómo te sentías…"
              className="mt-2 w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--bg)", boxShadow: "var(--depth-sm)" }}
            />
          </div>

          {error && <p className="text-sm" style={{ color: "var(--accent)" }} role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => dialog.current?.close()} disabled={saving} className="min-h-[52px] flex-1 rounded-full font-semibold" style={{ background: "var(--bg)", boxShadow: "var(--depth-sm)" }}>Cancelar</button>
            <button type="submit" disabled={!reason || saving} className="min-h-[52px] flex-[1.5] rounded-full font-display font-bold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--on-accent)", boxShadow: "3px 3px 0 0 var(--depth-shadow)" }}>
              {saving ? "Guardando…" : "Guardar PAS"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
