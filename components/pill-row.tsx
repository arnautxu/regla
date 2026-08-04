"use client";

import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   LA PASTILLA

   Dos botones y nada más. La anticonceptiva no admite matices: o te
   la has tomado o no. Un deslizador, una hora que teclear o un
   "parcialmente" serían inventarse un problema.

   Los tres estados importan:

     · sin contestar → no se ha preguntado o no ha contestado
     · tomada        → con la hora, porque a las 23:50 la pregunta
                       real es "¿ya me la he tomado?"
     · saltada       → contestó que no, y eso NO es lo mismo que no
                       haber contestado

   Volver a pulsar el botón activo deja el día sin contestar otra
   vez: es la única forma de deshacer un dedazo sin que la app te
   obligue a mentir en la otra dirección.

   Componente controlado, igual que FlowRow y MoodRow: no escribe en
   la base de datos por su cuenta.
   ═══════════════════════════════════════════════════════════════ */

const OPTIONS = [
  { taken: true, label: "Tomada" },
  { taken: false, label: "Hoy no" },
] as const;

export function PillRow({
  value,
  takenAt,
  streak,
  onChange,
  dateKey,
}: {
  value: boolean | undefined;
  /** ISO del momento en que se marcó, si está tomada */
  takenAt?: string;
  /** Días seguidos hasta hoy, incluido. 0 = no hay racha que contar */
  streak?: number;
  onChange: (taken: boolean | undefined) => void;
  dateKey: string;
}) {
  return (
    <section aria-labelledby={`pill-${dateKey}`}>
      <div className="flex items-baseline justify-between gap-md">
        <h3
          id={`pill-${dateKey}`}
          className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
        >
          Pastilla
        </h3>
        <p className="text-2xs text-faint">{aside(value, takenAt, streak)}</p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {OPTIONS.map((opt) => {
          const active = value === opt.taken;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                haptic(active ? 6 : opt.taken ? 14 : 8);
                onChange(active ? undefined : opt.taken);
              }}
              className="min-h-[46px] rounded-lg px-1 text-sm font-medium leading-[1.15] transition-[transform,box-shadow,color] duration-150 active:scale-[0.96] active:translate-x-[1px] active:translate-y-[1px]"
              style={{
                background: active ? "var(--accent-soft)" : "var(--surface)",
                boxShadow: active
                  ? "inset 0 0 0 1.5px var(--accent), 2px 2px 0 0 var(--depth-shadow)"
                  : "var(--depth-sm)",
                color: active ? "var(--accent)" : "var(--fg-muted)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* El texto de la derecha. Es lo único que cambia entre "hoy" y un día
   viejo del calendario, y por eso se decide aquí y no en dos sitios. */
function aside(
  value: boolean | undefined,
  takenAt: string | undefined,
  streak: number | undefined,
): string {
  if (value === false) return "Marcado como saltada";
  if (value !== true) return "Sin contestar";

  const hora = takenAt
    ? new Date(takenAt).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // La racha solo se canta a partir de tres días: felicitar por dos
  // suena a que la app tiene ganas de aplaudir cualquier cosa.
  if (streak && streak >= 3) {
    return hora ? `${hora} · ${streak} días seguidos` : `${streak} días seguidos`;
  }
  return hora ? `A las ${hora}` : "Tomada";
}
