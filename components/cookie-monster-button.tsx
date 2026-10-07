"use client";

import { useEffect, useState } from "react";
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

  // Vuelve a su estado normal unos segundos después de avisar.
  useEffect(() => {
    if (state !== "sent" && state !== "error") return;
    const t = setTimeout(() => {
      setState("idle");
      setMessage(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [state]);

  const label =
    state === "sending"
      ? "Mandando…"
      : state === "sent"
        ? "Aviso enviado"
        : state === "error"
          ? "No ha salido"
          : "Alarma galletas";

  return (
    <button
      type="button"
      onClick={() => void activate()}
      disabled={state === "sending"}
      title={message ?? undefined}
      className="flat flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold disabled:opacity-60"
      style={{
        background: "var(--surface)",
        color: state === "error" ? "var(--accent)" : state === "sent" ? "var(--ok)" : "var(--cookie)",
      }}
    >
      <span aria-hidden="true">{state === "sent" ? "✓" : "🍪"}</span>
      <span role="status" aria-live="polite">
        {label}
      </span>
    </button>
  );
}
