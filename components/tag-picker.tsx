"use client";

import { haptic } from "@/lib/use-lilaila";

/* Chips de selección múltiple. Sin relleno: el estado lo dice el
   trazo y el color del texto, igual que el resto de la app.

   Se dejan a lo ancho y envolviendo, no en rejilla fija: las
   etiquetas tienen anchos muy distintos ("Acné" contra "Tetas
   doloridas") y una rejilla obligaría a partir palabras o a dejar
   huecos enormes. */

export function TagPicker<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <section>
      <h3 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        {label}
      </h3>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <li key={opt.value}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  haptic(active ? 6 : 12);
                  onToggle(opt.value);
                }}
                className="min-h-[40px] rounded-full px-3.5 text-sm transition-[transform,box-shadow,color] duration-150 active:scale-[0.95] active:translate-x-[1px] active:translate-y-[1px]"
                style={{
                  background: active ? "var(--accent-soft)" : "var(--surface)",
                  boxShadow: active
                    ? "inset 0 0 0 1.5px var(--accent), 2px 2px 0 0 var(--depth-shadow)"
                    : "var(--depth-sm)",
                  color: active ? "var(--accent)" : "var(--fg-muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
