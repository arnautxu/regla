import type { CustomTag, DayLog } from "./db";
import { ANIMOS, SINTOMAS } from "./labels";

/* ═══════════════════════════════════════════════════════════════
   SEÑALES DE UN DÍA

   "¿Este día hubo X?" para cada cosa que se apunta. Lo usan el
   filtro del calendario (pintar solo los días con migraña) y lo que
   te espera en Hoy (qué suele tocar mañana). Un solo sitio, para que
   "dolor fuerte" signifique lo mismo en las dos pantallas.
   ═══════════════════════════════════════════════════════════════ */

export interface Signal {
  id: string;
  /** Lo que pone el botón del filtro */
  label: string;
  /** Cómo se dice mirando adelante: "Mañana ___" */
  predicate: string;
  /** Lo mínimo, para donde no cabe una frase: "Mañana: ___" */
  noun: string;
  /** Grupo, para ordenar los botones */
  group: "fuerte" | "sintoma" | "animo" | "propia";
  match: (log: DayLog) => boolean;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Las que se pueden filtrar, con las etiquetas suyas al final. */
export function signals(customTags: CustomTag[]): Signal[] {
  return [
    {
      id: "dolor-fuerte",
      label: "Dolor fuerte",
      predicate: "suele tocar dolor fuerte",
      noun: "dolor fuerte",
      group: "fuerte",
      match: (l) => (l.painLevel ?? 0) >= 6,
    },
    {
      id: "pas",
      label: "PAS",
      predicate: "suele caer algún PAS",
      noun: "PAS",
      group: "fuerte",
      match: (l) => !!l.cryEvents?.length,
    },
    {
      id: "monstruo",
      label: "Cookie Monster",
      predicate: "suele salir el Cookie Monster",
      noun: "Cookie Monster",
      group: "fuerte",
      match: (l) => !!l.angerEvents?.length,
    },
    {
      id: "sexo",
      label: "Sexo",
      predicate: "suele haber sexo",
      noun: "sexo",
      group: "fuerte",
      match: (l) => l.sex === true,
    },
    ...SINTOMAS.map(
      (o): Signal => ({
        id: `s:${o.value}`,
        label: o.label,
        predicate: `suele tocar ${o.value === "tetas-doloridas" ? "tetas doloridas" : lower(o.label)}`,
        noun: o.value === "tetas-doloridas" ? "tetas doloridas" : lower(o.label),
        group: "sintoma",
        match: (l) => !!l.symptoms?.includes(o.value),
      }),
    ),
    ...ANIMOS.map(
      (o): Signal => ({
        id: `a:${o.value}`,
        label: o.label,
        predicate: `sueles estar ${lower(o.label)}`,
        noun: lower(o.label),
        group: "animo",
        match: (l) => !!l.mood?.includes(o.value),
      }),
    ),
    ...customTags.map(
      (t): Signal => ({
        id: `t:${t.id}`,
        label: t.label,
        predicate: `suele salir «${t.label}»`,
        noun: `«${t.label}»`,
        group: "propia",
        match: (l) => !!l.tags?.includes(t.id),
      }),
    ),
  ];
}
