"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  db,
  removeMemory,
  updateSettings,
  wipeMemories,
  type ChatSettings,
} from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";
import { SwitchRow } from "./switch-row";

/* ═══════════════════════════════════════════════════════════════
   LO QUE LILITA RECUERDA

   La lista está a la vista y se borra una a una, y eso no es un
   extra de lujo: una app que guarda inferencias sobre alguien y no
   le enseña cuáles ha sacado le está haciendo un perfil a su
   espalda. Si Lilita ha apuntado "no se lleva bien con su madre",
   ella tiene que poder verlo y tacharlo.

   Los dos interruptores van separados porque son dos permisos
   distintos: acordarse de lo que le cuenta no es lo mismo que poder
   leer su diario, y se puede querer lo primero sin lo segundo.
   ═══════════════════════════════════════════════════════════════ */

export function MemoryPanel({ chat }: { chat: ChatSettings }) {
  const memories = useLiveQuery(() => db.memories.toArray(), [], []);
  const [confirmando, setConfirmando] = useState(false);

  // Más nuevas primero: lo último que le has contado es lo que más
  // probablemente quieras revisar o quitar.
  const lista = [...(memories ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        Lilita y tú
      </h2>

      <div
        className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
        style={{ background: "var(--surface)" }}
      >
        <SwitchRow
          label="Que se acuerde de ti"
          hint="Guarda lo que le cuentas y lo usa en las siguientes charlas."
          on={chat.remembers}
          onToggle={() => {
            haptic(10);
            // Apagarlo NO borra lo que ya sabe: son dos decisiones, y
            // dar por hecho que "no quiero que siga apuntando"
            // significa "tira lo de antes" es tomarla por ella.
            void updateSettings({
              chat: { ...chat, remembers: !chat.remembers },
            });
          }}
        />

        <SwitchRow
          label="Que pueda leer tus notas"
          hint="Las últimas notas del diario, para que entienda de qué hablas."
          on={chat.readsNotes}
          onToggle={() => {
            haptic(10);
            void updateSettings({
              chat: { ...chat, readsNotes: !chat.readsNotes },
            });
          }}
        />
      </div>

      {lista.length > 0 && (
        <>
          <h3 className="mt-lg text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
            Lo que recuerda
          </h3>

          <ul
            className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
            style={{ background: "var(--surface)" }}
          >
            {lista.map((m) => (
              <li key={m.id} className="flex items-start gap-md py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-relaxed">
                    {m.text}
                  </span>
                  <span className="mt-0.5 block text-xs text-faint">
                    {formatDistanceToNow(new Date(m.createdAt), {
                      locale: es,
                      addSuffix: true,
                    })}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    haptic(10);
                    void removeMemory(m.id);
                  }}
                  aria-label={`Que olvide: ${m.text}`}
                  className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full"
                  style={{ color: "var(--fg-faint)" }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-sm">
            {!confirmando ? (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex min-h-[44px] items-center text-xs text-faint underline underline-offset-4"
              >
                Que lo olvide todo
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm" style={{ color: "var(--accent)" }}>
                  Se le borra todo lo que sabe de ti. Tu diario no se toca.
                </p>
                <div className="flex gap-2">
                  <Boton
                    danger
                    onClick={() => {
                      haptic([40, 60, 40]);
                      void wipeMemories().then(() => setConfirmando(false));
                    }}
                  >
                    Sí, que lo olvide
                  </Boton>
                  <Boton onClick={() => setConfirmando(false)}>Cancelar</Boton>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <p className="mt-sm text-xs leading-relaxed text-faint">
        {chat.remembers
          ? "Lo apunta ella sola mientras habláis, y solo cosas que sigan valiendo dentro de un mes. Nunca el dato de hoy."
          : "Ahora mismo no apunta nada nuevo. Lo que ya sabe sigue ahí hasta que lo borres."}
      </p>
    </section>
  );
}

function Boton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] rounded-full px-4 text-sm transition-[transform,box-shadow] duration-150 active:scale-[0.97] active:translate-x-[1px] active:translate-y-[1px]"
      style={
        danger
          ? {
              background: "var(--accent)",
              color: "var(--on-accent)",
              boxShadow: "2px 2px 0 0 var(--depth-shadow)",
            }
          : {
              background: "var(--bg)",
              boxShadow: "var(--depth-sm)",
              color: "var(--fg-muted)",
            }
      }
    >
      {children}
    </button>
  );
}
