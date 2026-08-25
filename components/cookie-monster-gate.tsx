"use client";

import { useEffect, useRef, useState } from "react";

type Gate = "checking" | "setup" | "locked" | "open";

/** No comparte la sesión ni el PIN de Lídia. */
export function CookieMonsterGate({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("checking");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/cookie-monster/auth")
      .then((res) => res.json())
      .then((data: { configured?: boolean; authenticated?: boolean }) => {
        setGate(!data.configured ? "setup" : data.authenticated ? "open" : "locked");
      })
      .catch(() => setGate("locked"));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cookie-monster/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No he podido abrirlo.");
        setPin("");
        input.current?.focus();
        return;
      }
      setGate("open");
    } finally {
      setBusy(false);
    }
  }

  if (gate === "open") return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-xl px-safe pb-2xl">
      <div>
        <p className="text-center text-4xl">🍪</p>
        <h1 className="mt-4 text-center font-display text-xl font-bold tracking-[-0.03em]">Cookie Monster</h1>
        <p className="mt-2 text-center text-sm text-muted">
          {gate === "setup"
            ? "Falta configurar tu código privado en el servidor."
            : "Entra con tu código privado. No es el de Lidia."}
        </p>
      </div>
      {gate !== "setup" && gate !== "checking" && (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-md">
          <input
            ref={input}
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.slice(0, 64));
              setError(null);
            }}
            aria-label="Tu código privado"
            className="w-full rounded-2xl bg-transparent py-4 text-center font-display text-2xl tracking-[0.3em] outline-none"
            style={{ boxShadow: "inset 0 0 0 1.5px var(--border-strong)" }}
          />
          {error && <p role="alert" className="text-center text-sm" style={{ color: "var(--accent)" }}>{error}</p>}
          <button
            type="submit"
            disabled={pin.length < 4 || busy}
            className="w-full rounded-full px-lg py-4 font-display text-base font-bold disabled:opacity-40"
            style={{ background: "#2f7eae", color: "#fffdf8" }}
          >
            {busy ? "Comprobando…" : "Entrar"}
          </button>
        </form>
      )}
    </div>
  );
}
