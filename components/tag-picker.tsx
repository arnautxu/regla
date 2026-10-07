"use client";

import { haptic } from "@/lib/use-lilaila";
import { CHOICE_CLASS, choiceStyle } from "@/lib/choice";

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
  bare = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  /** Sin título visible y chips más grandes, para la hoja por pasos */
  bare?: boolean;
}) {
  return (
    <section aria-label={bare ? label : undefined}>
      {!bare && (
        <h3 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          {label}
        </h3>
      )}

      <ul className={bare ? "flex flex-wrap gap-2" : "mt-1.5 flex flex-wrap gap-1.5"}>
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
                className={`${bare ? "min-h-[44px] px-4 text-base" : "min-h-[34px] px-3 text-sm"} rounded-full ${CHOICE_CLASS}`}
                style={choiceStyle(active)}
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
