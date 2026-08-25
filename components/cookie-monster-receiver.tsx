"use client";

import { useEffect, useState } from "react";
import { enable, installed, status, type PushStatus } from "@/lib/push";

const EXPLICA: Record<PushStatus, string> = {
  "sin-soporte": "Instala Lilaila en la pantalla de inicio para poder recibir avisos.",
  bloqueado: "Las notificaciones están bloqueadas en los ajustes del móvil.",
  "sin-servidor": "Este despliegue aún no tiene avisos configurados.",
  apagado: "",
  encendido: "",
};

/** Página de una sola función para el móvil que recibe el aviso. */
export function CookieMonsterReceiver() {
  const [push, setPush] = useState<PushStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [insulting, setInsulting] = useState(false);
  const [insultMessage, setInsultMessage] = useState<string | null>(null);
  const [encouraging, setEncouraging] = useState(false);
  const [encourageMessage, setEncourageMessage] = useState<string | null>(null);
  const [personalText, setPersonalText] = useState("");
  const [sendingPersonal, setSendingPersonal] = useState(false);
  const [personalMessage, setPersonalMessage] = useState<string | null>(null);

  useEffect(() => {
    void status().then(setPush);
  }, []);

  async function activate() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await enable(22, "cookie-monster");
      setMessage(result.ok ? "Listo. Te avisaré cuando Lidia lo active." : result.message);
      setPush(await status());
    } finally {
      setBusy(false);
    }
  }

  const canActivate = push === "apagado" || push === "encendido";

  async function sendInsult() {
    if (insulting) return;
    setInsulting(true);
    setInsultMessage(null);
    try {
      const res = await fetch("/api/cookie-monster/insult", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setInsultMessage(res.ok ? "Pulla enviada a Lidia." : (data.error ?? "No he podido enviarla."));
    } finally {
      setInsulting(false);
    }
  }

  async function sendEncouragement() {
    if (encouraging) return;
    setEncouraging(true);
    setEncourageMessage(null);
    try {
      const res = await fetch("/api/cookie-monster/encourage", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setEncourageMessage(res.ok ? "Ánimos enviados a Lidia." : (data.error ?? "No he podido enviarlos."));
    } finally {
      setEncouraging(false);
    }
  }

  async function sendPersonalMessage() {
    if (sendingPersonal || !personalText.trim()) return;
    setSendingPersonal(true);
    setPersonalMessage(null);
    try {
      const res = await fetch("/api/cookie-monster/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: personalText }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) setPersonalText("");
      setPersonalMessage(res.ok ? "Mensaje enviado a Lidia." : (data.error ?? "No he podido enviarlo."));
    } finally {
      setSendingPersonal(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-lg px-safe pt-safe pb-safe">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Aviso privado</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">🍪 Cookie Monster</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Activa este móvil como receptor. No descarga ni ve los datos de Lidia.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void activate()}
        disabled={!canActivate || busy}
        className="w-full rounded-full px-lg py-4 font-display text-base font-bold transition-[transform,opacity] duration-150 active:scale-[0.975] disabled:opacity-45"
        style={{ background: "#2f7eae", color: "#fffdf8", boxShadow: "3px 3px 0 0 #16496a" }}
      >
        {busy ? "Activando…" : "Recibir avisos"}
      </button>

      {(message || push === null || (push && EXPLICA[push])) && (
        <p className="text-xs leading-relaxed text-faint" role="status" aria-live="polite">
          {message ?? (push ? EXPLICA[push] : "Comprobando…")}
        </p>
      )}

      {push === "sin-soporte" && !installed() && (
        <p className="text-xs leading-relaxed text-faint">
          En iPhone, abre Compartir → Añadir a inicio y después vuelve aquí.
        </p>
      )}

      <section className="mt-md border-t border-[var(--border)] pt-lg">
        <p className="text-sm text-muted">El otro sentido</p>
        <button
          type="button"
          onClick={() => void sendEncouragement()}
          disabled={encouraging}
          className="mt-3 w-full rounded-full px-lg py-3.5 font-display text-base font-bold transition-[transform,opacity] duration-150 active:scale-[0.975] disabled:opacity-45"
          style={{ background: "#2f7eae", color: "#fffdf8", boxShadow: "3px 3px 0 0 #16496a" }}
        >
          {encouraging ? "Mandando ánimos…" : "Mandarle ánimos a Lidia"}
        </button>
        {encourageMessage && (
          <p className="mt-2 text-xs leading-relaxed text-faint" role="status" aria-live="polite">
            {encourageMessage}
          </p>
        )}
        <div className="mt-lg border-t border-[var(--border)] pt-lg">
          <label htmlFor="mensaje-para-lidia" className="text-sm text-muted">
            Mensaje personal para Lidia
          </label>
          <textarea
            id="mensaje-para-lidia"
            value={personalText}
            maxLength={180}
            rows={3}
            onChange={(event) => {
              setPersonalText(event.target.value);
              setPersonalMessage(null);
            }}
            placeholder="Escríbele algo…"
            className="mt-2 w-full resize-none rounded-2xl bg-transparent px-md py-3 text-sm outline-none"
            style={{ boxShadow: "inset 0 0 0 1.5px var(--border-strong)" }}
          />
          <div className="mt-2 flex items-center justify-between gap-md">
            <span className="text-2xs text-faint">{personalText.length}/180 · No se guarda</span>
            <button
              type="button"
              onClick={() => void sendPersonalMessage()}
              disabled={sendingPersonal || !personalText.trim()}
              className="rounded-full px-md py-2 text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {sendingPersonal ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {personalMessage && (
            <p className="mt-2 text-xs leading-relaxed text-faint" role="status" aria-live="polite">
              {personalMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void sendInsult()}
          disabled={insulting}
          className="mt-3 w-full rounded-full px-lg py-3.5 font-display text-base font-bold transition-[transform,opacity] duration-150 active:scale-[0.975] disabled:opacity-45"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          {insulting ? "Mandando pulla…" : "🍪 Mandarle una pulla a Lidia"}
        </button>
        {insultMessage && (
          <p className="mt-2 text-xs leading-relaxed text-faint" role="status" aria-live="polite">
            {insultMessage}
          </p>
        )}
      </section>
    </div>
  );
}
