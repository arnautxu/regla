"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { stripVoiceTags } from "@/lib/voice-tags";
import { Lilita } from "@/components/lilita";
import { buildContext } from "@/lib/ai-context";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { addMemory, db, removeMemory } from "@/lib/db";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic, useLilaila } from "@/lib/use-lilaila";
import { accountMode } from "@/lib/account-mode";
import { LimiteCharlas, Planes } from "@/components/cuenta";
import { CUENTAS_ACTIVAS, refrescarPlan, useCuenta } from "@/lib/cuenta";
import { nombrePareja } from "@/lib/pareja";

// La librería de llamadas solo se descarga cuando Lídia llama.
const LiveCall = dynamic(
  () => import("@/components/live-call").then((m) => m.LiveCall),
  { ssr: false },
);

const LIST = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const ITEM = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE_OUT_QUART } },
};

const SUGERENCIAS = [
  "¿Por qué llevo unos meses con más dolor?",
  "¿Esto que me pasa es normal?",
  "¿Cuándo me toca y cuánto te fías?",
];

// Seis turnos completos bastan para mantener el hilo. El resto ya está
// resumido en el contexto y en las memorias de Lilita; reenviarlo entero
// hacía crecer el tiempo de respuesta después de cada mensaje.
const RECENT_MESSAGE_LIMIT = 12;

function recentConversation(messages: UIMessage[]): UIMessage[] {
  const recent = messages.slice(-RECENT_MESSAGE_LIMIT);
  const firstUserMessage = recent.findIndex((message) => message.role === "user");
  return firstUserMessage === -1 ? recent : recent.slice(firstUserMessage);
}

export default function Chat() {
  const router = useRouter();
  const { ready, state, today, settings, cycles, dateKey, line } = useLilaila();
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const [input, setInput] = useState("");
  const [calling, setCalling] = useState(false);
  const cuenta = useCuenta();
  const [limite, setLimite] = useState(false);
  const [planes, setPlanes] = useState<null | "anual" | "voz">(null);
  // El onError de useChat se queda con el primer render: el plan, por ref.
  const plan = useRef(cuenta?.plan);
  useEffect(() => {
    plan.current = cuenta?.plan;
  }, [cuenta?.plan]);
  const bottom = useRef<HTMLDivElement>(null);
  // Lilita solo habla en las llamadas: el teléfono sale si el
  // servidor tiene ElevenLabs.
  const [canCall, setCanCall] = useState(false);

  const memories = useLiveQuery(() => db.memories.toArray(), [], []);

  useEffect(() => {
    let alive = true;
    fetch("/api/voz/directo")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean }) => alive && setCanCall(!!d.enabled))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const context = useMemo(() => {
    const insights = computeInsights(cycles, days ?? [], settings, dateKey, (d, len) =>
      phaseByDay(d, len, settings.avgPeriodLength),
    );
    return buildContext(state, today, settings.humorLevel, insights, {
      days,
      memories,
      chat: settings.chat,
      pareja: nombrePareja(settings),
    });
  }, [state, today, settings, cycles, days, memories, dateKey]);

  const { messages, sendMessage, status, error, addToolOutput } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // El contexto viaja en cada envío, no en el historial: así el
      // modelo ve siempre sus datos de AHORA y no los de cuando
      // empezó la conversación.
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages: recentConversation(messages), context },
      }),
    }),

    // La respuesta llega en fragmentos pequeños. Agrupar sus repintados
    // evita que Safari rehaga toda la conversación por cada token.
    throttle: 40,

    // Sin esto, Lilita guarda la memoria y se queda callada: la
    // conversación se para esperando a que alguien devuelva el
    // resultado de la herramienta. Esto lo reenvía solo en cuanto
    // están todos, y ella sigue hablando como si nada.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    // El servidor confirma que hace falta Plus, incluso si el plan local estaba desactualizado.
    onError(e) {
      if (CUENTAS_ACTIVAS && /"code":"(?:messages|plus_required)"/.test(e.message)) {
        void refrescarPlan();
        if (plan.current === "free" || /"code":"plus_required"/.test(e.message)) setLimite(true);
      }
    },

    async onToolCall({ toolCall }) {
      // El guardia de `dynamic` primero: sin él, TypeScript no sabe
      // estrechar `toolName` a los dos nombres que conocemos.
      if (toolCall.dynamic) return;

      if (toolCall.toolName === "recordar") {
        const { dato } = toolCall.input as { dato: string };
        void addMemory(dato);
        // Sin await a propósito: la documentación avisa de que
        // esperar aquí puede bloquear el propio flujo del chat.
        addToolOutput({
          tool: "recordar",
          toolCallId: toolCall.toolCallId,
          output: "guardado",
        });
      }

      if (toolCall.toolName === "olvidar") {
        const { id } = toolCall.input as { id: string };
        void removeMemory(id);
        addToolOutput({
          tool: "olvidar",
          toolCallId: toolCall.toolCallId,
          output: "olvidado",
        });
      }
    },
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: status === "streaming" ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, status]);

  function send(text: string) {
    if (!text.trim() || status !== "ready") return;
    if (CUENTAS_ACTIVAS && cuenta?.plan === "free") {
      haptic(8);
      setLimite(true);
      return;
    }
    haptic(10);
    void sendMessage({ text });
    setInput("");
  }

  if (!ready) return null;

  return (
    <div className="flex flex-1 flex-col px-safe pt-safe">
      <header className="flex items-center gap-3 py-md">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Volver"
          className="flex size-10 items-center justify-center rounded-full"
          style={{ color: "var(--fg-muted)" }}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.5 5 L8 12 L14.5 19" />
          </svg>
        </button>
        <Lilita mood={line.mood} size={34} className="shrink-0" />
        <h1 className="flex-1 font-display text-lg font-bold tracking-[-0.02em]">
          Lilita
        </h1>
        {canCall && (
          <button
            type="button"
            aria-label="Llamar a Lilita"
            onClick={() => {
              haptic(10);
              // Las llamadas son de Plus con voz.
              if (CUENTAS_ACTIVAS && cuenta?.plan !== "voice") setPlanes("voz");
              else setCalling(true);
            }}
            className="flex size-10 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              boxShadow: "2px 2px 0 0 var(--depth-shadow)",
            }}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
            </svg>
          </button>
        )}
      </header>
      <LimiteCharlas
        abierta={limite}
        onCerrar={() => setLimite(false)}
        onPlus={() => {
          setLimite(false);
          setPlanes("anual");
        }}
      />
      {planes && <Planes inicial={planes} onCerrar={() => setPlanes(null)} />}
      {calling && (
        <LiveCall context={context} mood={line.mood} onClose={() => setCalling(false)} />
      )}

      <div className="flex flex-1 flex-col gap-lg overflow-y-auto pb-md">
        {messages.length === 0 && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={LIST}
            className="flex flex-col items-center gap-md pt-lg"
          >
            <motion.div variants={ITEM}>
              <Lilita mood={line.mood} size={116} saluda />
            </motion.div>
            <motion.p
              variants={ITEM}
              className="max-w-[30ch] text-center text-sm leading-relaxed text-muted"
            >
              Tengo tus datos delante. Pregúntame lo que quieras — pero recuerda
              que soy una gota de sangre animada, no una ginecóloga.
            </motion.p>

            <ul className="mt-sm flex w-full flex-col gap-2">
              {SUGERENCIAS.map((s) => (
                <motion.li key={s} variants={ITEM}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="w-full rounded-xl px-4 py-3 text-left text-sm transition-[transform,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
                    style={{ background: "var(--surface)", boxShadow: "var(--depth-sm)" }}
                  >
                    {s}
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}

        {messages.map((m) => {
          const mine = m.role === "user";
          const text = textOf(m);
          if (!text) return null;

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
              className={mine ? "flex justify-end" : "flex justify-start"}
            >
              <p
                className={
                  mine
                    ? "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                    : "sticker-sm max-w-[92%] rounded-2xl px-4 py-2.5 text-base leading-relaxed"
                }
                style={
                  mine
                    ? {
                        background: "var(--accent)",
                        color: "var(--on-accent)",
                        boxShadow: "2px 2px 0 0 var(--depth-shadow)",
                      }
                    : { background: "var(--surface)" }
                }
              >
                {text}
              </p>
            </motion.div>
          );
        })}

        {status === "submitted" && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
            className="text-sm text-faint"
          >
            Lilita está pensando…
          </motion.p>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--accent)" }}>
            Me he quedado sin palabras. Prueba otra vez en un momento.
            {whyFailed(error) && (
              <span className="mt-1 block text-xs text-muted">{whyFailed(error)}</span>
            )}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-line py-md pb-safe"
      >
        <input
          maxLength={accountMode() ? 2000 : undefined}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe aquí…"
          aria-label="Tu pregunta"
          className="min-h-[46px] flex-1 rounded-full px-4 text-base outline-none"
          style={{ background: "var(--surface)", boxShadow: "var(--depth-sm)" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || status !== "ready"}
          aria-label="Enviar"
          className="flex size-[46px] shrink-0 items-center justify-center rounded-full transition-[transform,opacity,box-shadow] duration-150 active:scale-90 disabled:opacity-35"
          style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            boxShadow: "2px 2px 0 0 var(--depth-shadow)",
          }}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/** El porqué del fallo, si vale la pena enseñarlo. */
function whyFailed(error: Error): string {
  const raw = error.message ?? "";
  try {
    const body = JSON.parse(raw) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  if (!raw || raw === "An error occurred.") return "";
  if (/failed to fetch|load failed|network/i.test(raw)) return "Sin conexión.";
  return raw.slice(0, 200);
}

/** Lo que se lee en pantalla. Sin acotaciones de voz, por si queda
    alguna de cuando el chat también hablaba. */
function textOf(m: UIMessage): string {
  return stripVoiceTags(m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""));
}
