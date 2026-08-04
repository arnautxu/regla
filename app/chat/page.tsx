"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { Lilita } from "@/components/lilita";
import { buildContext } from "@/lib/ai-context";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { db } from "@/lib/db";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic, useLilaila } from "@/lib/use-lilaila";

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

export default function Chat() {
  const router = useRouter();
  const { ready, state, today, settings, cycles, dateKey, line } = useLilaila();
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const context = useMemo(() => {
    const insights = computeInsights(cycles, days ?? [], settings, dateKey, (d, len) =>
      phaseByDay(d, len, settings.avgPeriodLength),
    );
    return buildContext(state, today, settings.humorLevel, insights);
  }, [state, today, settings, cycles, days, dateKey]);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // El contexto viaja en cada envío, no en el historial: así el
      // modelo ve siempre sus datos de AHORA y no los de cuando
      // empezó la conversación.
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, context },
      }),
    }),
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function send(text: string) {
    if (!text.trim() || status !== "ready") return;
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
        <h1 className="font-display text-lg font-bold tracking-[-0.02em]">
          Pregúntale a Lilita
        </h1>
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
              <Lilita mood={line.mood} size={116} />
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
          const text = m.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("");
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
