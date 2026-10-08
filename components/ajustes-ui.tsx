"use client";

import Link from "next/link";
import type { HumorLevel } from "@/lib/db";

/* ═══════════════════════════════════════════════════════════════
   PIEZAS DE AJUSTES

   Ajustes es un índice corto y cada apartado vive en su pantalla.
   Antes eran diez paneles uno detrás de otro: para cambiar el tema
   había que pasar por las etiquetas, los recuerdos y los avisos.
   ═══════════════════════════════════════════════════════════════ */

/** Cabecera de un apartado: vuelta al índice y el título. */
export function Apartado({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-xl px-safe pt-safe pb-xl">
      <div className="flex flex-col gap-sm pt-lg">
        <Link href="/ajustes" className="self-start text-sm font-semibold text-muted">
          ← Ajustes
        </Link>
        <h1 className="font-display text-xl font-bold tracking-[-0.03em]">{titulo}</h1>
      </div>
      {children}
    </div>
  );
}

/** Una fila del índice: icono, nombre, resumen y flecha. */
export function FilaIndice({
  href,
  icono,
  label,
  valor,
}: {
  href: string;
  icono: string;
  label: string;
  valor?: string;
}) {
  return (
    <Link href={href} className="flex min-h-[58px] items-center gap-3 py-2.5">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-xl text-lg"
        style={{ background: "var(--accent-soft)" }}
      >
        {icono}
      </span>
      <span className="min-w-0 flex-1 text-base">{label}</span>
      {valor && <span className="shrink-0 truncate text-sm text-faint">{valor}</span>}
      <span aria-hidden="true" className="text-faint">
        ›
      </span>
    </Link>
  );
}

/** Elegir una de pocas opciones cortas, en una sola línea. */
export function Segmentos<T extends string>({
  label,
  opciones,
  valor,
  onChange,
}: {
  label: string;
  opciones: { value: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-2xl p-1"
      style={{ background: "var(--bg)", boxShadow: "inset 0 0 0 1.5px var(--border)" }}
    >
      {opciones.map((o) => {
        const sel = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => !sel && onChange(o.value)}
            className="min-h-11 flex-1 rounded-xl text-center text-sm transition-colors duration-150"
            style={
              sel
                ? { background: "var(--surface)", color: "var(--accent)", fontWeight: 700, boxShadow: "var(--depth-sm)" }
                : { color: "var(--fg-muted)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const HUMOR: { value: HumorLevel; label: string; hint: string }[] = [
  { value: "gamberro", label: "Gamberra", hint: "Lilita dice lo que piensa, sin filtro." },
  { value: "suave", label: "Suave", hint: "Sigue estando, pero baja el volumen." },
  { value: "off", label: "Callada", hint: "Solo los datos. Cero comentarios." },
];
