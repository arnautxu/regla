"use client";

import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import type { LilitaContext } from "@/lib/ai-context";
import { stripVoiceTags } from "@/lib/voice-tags";
import { haptic } from "@/lib/use-lilaila";
import type { Mood } from "@/lib/lilita/lines";
import { Lilita } from "./lilita";

/* ═══════════════════════════════════════════════════════════════
   LA LLAMADA CON LILITA

   Pantalla entera, como una llamada de verdad: Lilita en grande
   moviendo la boca cuando habla, lo último que ha dicho debajo, y
   dos botones (silenciar y colgar). La conversación va directa
   entre el móvil y ElevenLabs; el servidor solo da el pase.
   ═══════════════════════════════════════════════════════════════ */

export function LiveCall(props: { context: LilitaContext; mood: Mood; onClose: () => void }) {
  return (
    <ConversationProvider>
      <Call {...props} />
    </ConversationProvider>
  );
}

function Call({ context, mood, onClose }: { context: LilitaContext; mood: Mood; onClose: () => void }) {
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const [muted, setMuted] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const call = useConversation({
    micMuted: muted,
    onMessage: (m) => {
      if (m.source === "ai") setSaid(stripVoiceTags(m.message));
    },
    onError: (message) => setError(friendly(message)),
    onDisconnect: (d) => {
      if (d.reason === "error") setError(friendly(d.message));
    },
  });

  // El contexto se lee una vez, al descolgar: es la foto del día con
  // la que Lilita empieza la llamada.
  const ctx = useRef(context);
  const { startSession, endSession } = call;
  useEffect(() => {
    // Sin guardas de "ya empezado": en desarrollo React monta dos
    // veces, y la primera se cancela antes de llegar a descolgar.
    let cancelled = false;
    (async () => {
      // El micro primero: si dice que no, mejor saberlo antes de
      // gastar un pase de ElevenLabs.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        if (!cancelled) setError("Sin permiso para el micro no puedo oírte. Actívalo en los ajustes del móvil.");
        return;
      }
      if (cancelled) return;
      let res: Response;
      try {
        res = await fetch("/api/voz/directo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ context: ctx.current }),
        });
      } catch {
        setError("Sin conexión: no he podido llamar a Lilita.");
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { token?: string; prompt?: string; voiceId?: string; limited?: boolean; maxSeconds?: number; error?: string }
        | null;
      if (!res.ok || !data?.token) {
        setError(
          data?.error ??
            (res.status === 401
              ? "La sesión ha caducado. Vuelve a entrar con el PIN."
              : `No he podido llamar a Lilita (${res.status}).`),
        );
        return;
      }
      if (cancelled) return;
      setRemaining(data.maxSeconds ?? null);
      try { startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        overrides: data.limited ? undefined : {
          agent: {
            prompt: { prompt: data.prompt },
            firstMessage: saludo(ctx.current),
            language: "es",
          },
          tts: { voiceId: data.voiceId },
        },
      }); } catch { if (!cancelled) setError("No se ha podido conectar la llamada. Puedes seguir por escrito."); }
    })();
    return () => {
      cancelled = true;
    };
  }, [startSession]);

  // Al salir de la pantalla, se cuelga sí o sí: un micro abierto que
  // nadie ve sería lo peor que podría hacer esta app.
  useEffect(() => () => endSession(), [endSession]);

  useEffect(() => {
    if (call.status !== "connected" || remaining === null) return;
    if (remaining === 0) { void endSession(); return; }
    const timer = setTimeout(() => setRemaining(n => n === null ? null : Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [call.status, remaining, endSession]);

  const hangUp = () => {
    haptic(12);
    endSession();
    onClose();
  };

  const estado = error
    ? "No ha podido ser"
    : call.status === "connected"
      ? call.isSpeaking
        ? "Lilita habla"
        : muted
          ? "Micro silenciado"
          : "Te escucho"
      : call.status === "disconnected" && said
        ? "Llamada terminada"
        : "Llamando a Lilita…";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Llamada con Lilita"
      className="fixed inset-0 z-50 flex flex-col items-center justify-between px-lg pt-safe pb-safe"
      style={{ background: "var(--bg)" }}
    >
      <p className="mt-xl text-2xs font-semibold uppercase tracking-[0.14em] text-faint" aria-live="polite">
        {estado}
        {remaining !== null && <span className="mt-2 block normal-case tracking-normal">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} · tiempo máximo de esta llamada</span>}
      </p>

      <div className="flex flex-col items-center gap-lg">
        <div
          className="rounded-full p-md transition-shadow duration-300"
          style={{
            boxShadow:
              call.status === "connected" && !call.isSpeaking && !muted
                ? "0 0 0 10px var(--accent-soft)"
                : "0 0 0 0 transparent",
          }}
        >
          <Lilita mood={error ? "panico" : mood} size={180} speaking={call.isSpeaking} />
        </div>
        <p
          className="min-h-[4.5em] max-w-[22rem] text-center text-base leading-snug"
          style={{ color: error ? "var(--accent)" : "var(--fg-muted)" }}
          role={error ? "alert" : undefined}
        >
          {error || said}
        </p>
      </div>

      <div className="mb-xl flex items-center gap-xl">
        <button
          type="button"
          aria-label={muted ? "Activar el micro" : "Silenciar el micro"}
          aria-pressed={muted}
          disabled={!!error}
          onClick={() => {
            haptic(8);
            setMuted((m) => !m);
          }}
          className="flex size-16 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-30"
          style={{
            background: muted ? "var(--fg)" : "var(--surface)",
            color: muted ? "var(--bg)" : "var(--fg)",
            boxShadow: "inset 0 0 0 1.5px var(--border-strong), 2px 2px 0 0 var(--depth-shadow)",
          }}
        >
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            {muted && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <button
          type="button"
          aria-label="Colgar"
          onClick={hangUp}
          className="flex size-20 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            boxShadow: "3px 3px 0 0 var(--depth-shadow)",
          }}
        >
          <svg viewBox="0 0 24 24" className="size-9" fill="currentColor" aria-hidden="true">
            <path d="M12 9c-2.6 0-5.1.5-7.3 1.6-.7.3-1.1 1-1.1 1.8v2.1c0 .7.6 1.2 1.3 1.1l3-.5c.6-.1 1-.6 1-1.2v-1.7c1-.3 2-.4 3.1-.4s2.1.1 3.1.4v1.7c0 .6.4 1.1 1 1.2l3 .5c.7.1 1.3-.4 1.3-1.1v-2.1c0-.8-.4-1.5-1.1-1.8C17.1 9.5 14.6 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Lo primero que dice al descolgar. */
function saludo(c: LilitaContext): string {
  if (c.frenoDeMano) return "[softly] Hola, cariño. Estoy aquí. ¿Cómo estás?";
  if (c.humor === "off") return "Hola. Dime.";
  return "[excited] ¡Hola! ¿Qué pasa, que ya no te basta con escribirme?";
}

/** Los errores de la librería vienen en inglés técnico. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("permission") || m.includes("notallowed"))
    return "Sin permiso para el micro no puedo oírte. Actívalo en los ajustes del móvil.";
  if (m.includes("quota") || m.includes("credit"))
    return "Se han acabado los minutos de ElevenLabs de este mes.";
  if (m.includes("override"))
    return "El agente de ElevenLabs no deja cambiar sus instrucciones. Activa los overrides en su pestaña Security.";
  return `Se ha cortado la llamada (${message.slice(0, 100)}).`;
}
