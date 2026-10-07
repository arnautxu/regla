"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { Lilita } from "@/components/lilita";
import { buildContext } from "@/lib/ai-context";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { addMemory, db, removeMemory, updateSettings } from "@/lib/db";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic, useLilaila } from "@/lib/use-lilaila";
import { useVoice } from "@/lib/use-voice";

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
  const bottom = useRef<HTMLDivElement>(null);
  const voice = useVoice();
  const voiceOn = voice.available && settings.chat.voice;

  const memories = useLiveQuery(() => db.memories.toArray(), [], []);

  const context = useMemo(() => {
    const insights = computeInsights(cycles, days ?? [], settings, dateKey, (d, len) =>
      phaseByDay(d, len, settings.avgPeriodLength),
    );
    return buildContext(state, today, settings.humorLevel, insights, {
      days,
      memories,
      chat: settings.chat,
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

  // Cuando Lilita termina de escribir, lo dice. Solo al ACABAR: leer
  // a trozos mientras llega cortaría las frases por la mitad.
  const prevStatus = useRef(status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (!voiceOn || status !== "ready" || was === "ready") return;
    const last = messages.at(-1);
    if (last?.role !== "assistant") return;
    const text = textOf(last);
    if (text) void voice.speak(last.id, text);
  }, [status, messages, voiceOn, voice]);

  function send(text: string) {
    if (!text.trim() || status !== "ready") return;
    haptic(10);
    // Dentro del toque: es lo que deja sonar la respuesta en iOS.
    if (voiceOn) voice.unlock();
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
        <Lilita mood={line.mood} size={34} speaking={voice.talking} className="shrink-0" />
        <h1 className="flex-1 font-display text-lg font-bold tracking-[-0.02em]">
          Lilita
        </h1>
        {voice.available && (
          <button
            type="button"
            role="switch"
            aria-checked={settings.chat.voice}
            aria-label="Lilita habla en voz alta"
            onClick={() => {
              haptic(8);
              if (settings.chat.voice) voice.stop();
              else voice.unlock();
              void updateSettings({
                chat: { ...settings.chat, voice: !settings.chat.voice },
              });
            }}
            className="flat flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"
            style={{
              background: settings.chat.voice ? "var(--accent-soft)" : "var(--surface)",
              color: settings.chat.voice ? "var(--accent)" : "var(--fg-faint)",
            }}
          >
            <SpeakerIcon on={settings.chat.voice} />
            {settings.chat.voice ? "Voz" : "Muda"}
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-lg overflow-y-auto pb-md">
        {messages.length === 0 && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={LIST}
            className="flex flex-col items-center gap-md pt-lg"
          >
            <motion.div variants={ITEM}>
              <Lilita mood={line.mood} size={116} speaking={voice.talking} />
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
          const sounding = voice.playing === m.id;

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
              className={mine ? "flex justify-end" : "flex flex-col items-start gap-1"}
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
              {!mine && voice.available && (status === "ready" || m.id !== messages.at(-1)?.id) && (
                <button
                  type="button"
                  onClick={() => {
                    haptic(8);
                    if (sounding) voice.stop();
                    else {
                      voice.unlock();
                      void voice.speak(m.id, text);
                    }
                  }}
                  className="flex min-h-[32px] items-center gap-1.5 px-1 text-xs font-semibold"
                  style={{ color: sounding ? "var(--accent)" : "var(--fg-faint)" }}
                  aria-label={sounding ? "Parar la voz" : "Escuchar a Lilita"}
                >
                  <SpeakerIcon on={sounding} />
                  {sounding ? "Hablando… toca para parar" : "Escuchar"}
                </button>
              )}
              {!mine && voice.error?.id === m.id && (
                <p role="alert" className="max-w-[92%] px-1 text-xs" style={{ color: "var(--accent)" }}>
                  {voice.error.message}
                </p>
              )}
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

function textOf(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {on ? (
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}
