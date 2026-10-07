"use client";

import { useState } from "react";
import {
  DEFAULT_STEP_ORDER,
  addCustomTag,
  removeCustomTag,
  updateSettings,
  type Settings,
  type StepId,
} from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   EL REGISTRO, A SU MANERA

   Qué preguntas salen al apuntar el día y en qué orden. Si no usa
   "sexo", que no se lo pregunte cada noche; si lo primero que quiere
   apuntar es el ánimo, que vaya primero.

   El sangrado no sale en la lista: va siempre el primero y no se
   puede esconder, porque de él sale el ciclo entero.

   Flechas para mover y no arrastrar: arrastrar en una lista dentro
   de una página que también se desplaza es una pelea con el dedo
   que en iPhone se pierde la mitad de las veces.
   ═══════════════════════════════════════════════════════════════ */

const NOMBRE: Record<StepId, string> = {
  dia: "Cómo va el día",
  duele: "Qué te duele",
  animo: "Ánimo",
  pastilla: "Pastilla",
  sexo: "Sexo",
  propias: "Lo tuyo (tus etiquetas)",
};

export function StepsPanel({ settings }: { settings: Settings }) {
  const { order, hidden } = settings.steps;
  const lista = [...order, ...DEFAULT_STEP_ORDER.filter((p) => !order.includes(p))];
  const [nueva, setNueva] = useState("");

  function guardar(nextOrder: StepId[], nextHidden: StepId[]) {
    void updateSettings({ steps: { order: nextOrder, hidden: nextHidden } });
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    haptic(8);
    const next = [...lista];
    [next[i], next[j]] = [next[j], next[i]];
    guardar(next, hidden);
  }

  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        El registro del día
      </h2>
      <ol
        className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
        style={{ background: "var(--surface)" }}
      >
        <li className="flex min-h-[52px] items-center gap-md py-2">
          <span className="flex-1 text-base">Sangrado</span>
          <span className="text-xs text-faint">Siempre primero</span>
        </li>
        {lista.map((p, i) => {
          const visible = !hidden.includes(p);
          const nota =
            p === "pastilla" && !settings.pill.enabled
              ? "Solo si llevas la cuenta"
              : p === "propias" && settings.customTags.length === 0
                ? "Cuando crees alguna"
                : null;
          return (
            <li key={p} className="flex min-h-[52px] items-center gap-1 py-2">
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                onClick={() => {
                  haptic(10);
                  guardar(lista, visible ? [...hidden, p] : hidden.filter((h) => h !== p));
                }}
                className="flex flex-1 items-center gap-md text-left"
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full transition-transform duration-150"
                  style={{
                    background: visible ? "var(--accent)" : "var(--border-strong)",
                    transform: visible ? "scale(1)" : "scale(0.6)",
                  }}
                />
                <span>
                  <span
                    className="block text-base"
                    style={{ color: visible ? "var(--fg)" : "var(--fg-faint)" }}
                  >
                    {NOMBRE[p]}
                  </span>
                  {nota && visible && <span className="block text-xs text-faint">{nota}</span>}
                </span>
              </button>
              <Flecha label={`Subir ${NOMBRE[p]}`} d="M6 15 L12 9 L18 15" off={i === 0} onClick={() => mover(i, -1)} />
              <Flecha label={`Bajar ${NOMBRE[p]}`} d="M6 9 L12 15 L18 9" off={i === lista.length - 1} onClick={() => mover(i, 1)} />
            </li>
          );
        })}
      </ol>
      <p className="mt-sm text-xs leading-relaxed text-faint">
        Toca una para esconderla. Lo ya apuntado no se borra.
      </p>

      <h3 className="mt-lg text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        Tus etiquetas
      </h3>
      <div
        className="sticker mt-sm flex flex-col gap-sm rounded-2xl px-lg py-md"
        style={{ background: "var(--surface)" }}
      >
        {settings.customTags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {settings.customTags.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`¿Borrar «${t.label}»? Los días que la tienen no se tocan.`)) return;
                    haptic(8);
                    void removeCustomTag(t.id);
                  }}
                  aria-label={`Borrar ${t.label}`}
                  className="flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
                  style={{ boxShadow: "inset 0 0 0 1.5px var(--border-strong)" }}
                >
                  {t.label}
                  <span aria-hidden="true" className="text-faint">✕</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Lo que te importe y no esté: «resaca», «exámenes», «gimnasio»… Luego
            te digo si se repite en alguna parte del ciclo.
          </p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nueva.trim()) return;
            haptic(10);
            void addCustomTag(nueva);
            setNueva("");
          }}
        >
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            maxLength={24}
            placeholder="Nueva etiqueta"
            className="min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none"
            style={{ background: "var(--bg)", boxShadow: "inset 0 0 0 1.5px var(--border)" }}
          />
          <button
            type="submit"
            disabled={!nueva.trim()}
            className="rounded-full px-4 text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            Crear
          </button>
        </form>
      </div>
    </section>
  );
}

function Flecha({
  label,
  d,
  off,
  onClick,
}: {
  label: string;
  d: string;
  off: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={off}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-20"
      style={{ color: "var(--fg-muted)" }}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}
