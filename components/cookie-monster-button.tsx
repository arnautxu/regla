"use client";

import { useState } from "react";
import { haptic } from "@/lib/use-lilaila";

/** El gesto de Lídia: manda una única señal, sin compartir su diario. */
export function CookieMonsterButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function activate() {
    if (state === "sending") return;
    setState("sending");
    setMessage(null);
    haptic(16);

    try {
      const res = await fetch("/api/cookie-monster", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No he podido mandar el aviso.");
      haptic([14, 40, 18]);
      setState("sent");
      setMessage("Aviso enviado.");
    } catch (error) {
      haptic([40, 50, 40]);
      setState("error");
      setMessage(error instanceof Error ? error.message : "No he podido mandar el aviso.");
    }
  }

  return (
    <section
      className="sticker rounded-2xl px-lg py-md"
      style={{ background: "var(--surface)" }}
    >
      <p className="text-sm text-muted">¿Necesitas activar la alarma de galletas?</p>
      <button
        type="button"
        onClick={() => void activate()}
        disabled={state === "sending"}
        className="mt-3 w-full rounded-full px-lg py-3.5 font-display text-base font-bold transition-[transform,opacity] duration-150 active:scale-[0.975] disabled:opacity-55"
        style={{ background: "#2f7eae", color: "#fffdf8", boxShadow: "3px 3px 0 0 #16496a" }}
      >
        {state === "sending" ? "Mandando aviso…" : "🍪 Cookie Monster"}
      </button>
      {message && (
        <p className="mt-2 text-xs text-faint" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
