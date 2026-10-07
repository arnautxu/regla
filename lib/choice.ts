import type { CSSProperties } from "react";

/* ═══════════════════════════════════════════════════════════════
   UN SOLO ASPECTO PARA "ELEGIR UNA COSA"

   Flujo, cómo va el día, pastilla, sexo, síntomas y ánimo eran seis
   copias del mismo estilo en línea, y cada una con su sombra de
   pegatina. En una hoja con treinta botones, treinta pegatinas son
   ruido: ahora lo apagado es plano (trazo fino) y solo lo elegido se
   levanta con el acento y la sombra corta.
   ═══════════════════════════════════════════════════════════════ */

export function choiceStyle(active: boolean): CSSProperties {
  return {
    background: active ? "var(--accent-soft)" : "var(--surface)",
    boxShadow: active
      ? "inset 0 0 0 2px var(--accent), 2px 2px 0 0 var(--depth-shadow)"
      : "inset 0 0 0 1.5px var(--border)",
    color: active ? "var(--accent)" : "var(--fg)",
    fontWeight: active ? 650 : 450,
  };
}

export const CHOICE_CLASS =
  "transition-[transform,box-shadow,color] duration-150 active:scale-[0.96]";
