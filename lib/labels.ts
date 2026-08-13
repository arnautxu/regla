import type {
  FlowLevel,
  MoodTag,
  SexActivity,
  SexProtection,
  SymptomTag,
} from "./db";

/* ═══════════════════════════════════════════════════════════════
   LAS PALABRAS, EN UN SOLO SITIO

   Estaban repartidas por los componentes que las pintaban: el flujo
   en flow-row, los síntomas y el ánimo en day-sheet, el sexo en
   sex-row. Mientras solo hubiera botones daba igual — cada lista se
   pintaba a sí misma y no había con qué contradecirse.

   Con el resumen del día ya no: la ficha tiene que DECIR lo mismo
   que marcan los botones, y con dos copias de cada palabra eso dura
   hasta el primer cambio de "Cagalera" a otra cosa.
   ═══════════════════════════════════════════════════════════════ */

export interface Opcion<T> {
  value: T;
  label: string;
}

/** El 0 se llama distinto según lo que signifique en ese día. Ver
    `flowOptions`: en mitad de una regla, marcarlo es acabarla. */
export const FLOW: Opcion<FlowLevel>[] = [
  { value: 0, label: "Nada" },
  { value: 1, label: "Poco" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Mucho" },
  { value: 4, label: "Diluvio" },
];

/**
 * Las opciones de sangrado para un día concreto.
 *
 * Si el día anterior sangró, marcar 0 aquí no es "hoy nada": es el
 * final de la regla, porque eso es justo lo que hace en el modelo
 * (ver `derivedCycles`, que cierra la racha en el primer día con
 * flujo 0). El botón pasa a decirlo con esas palabras en vez de
 * dejarlo escrito en una nota al pie debajo del botón.
 */
export function flowOptions(endsPeriod: boolean): Opcion<FlowLevel>[] {
  if (!endsPeriod) return FLOW;
  return FLOW.map((o) =>
    o.value === 0 ? { ...o, label: "Se acabó" } : o,
  );
}

export const SINTOMAS: Opcion<SymptomTag>[] = [
  { value: "retortijones", label: "Retortijones" },
  { value: "dolor-lumbar", label: "Lumbares" },
  { value: "tetas-doloridas", label: "Tetas" },
  { value: "migrana", label: "Migraña" },
  { value: "hinchazon", label: "Hinchazón" },
  { value: "cansancio", label: "Cansancio" },
  { value: "insomnio", label: "Insomnio" },
  { value: "antojos", label: "Antojos" },
  { value: "acne", label: "Acné" },
  { value: "cagalera", label: "Cagalera" },
];

export const ANIMOS: Opcion<MoodTag>[] = [
  { value: "tranquila", label: "Tranquila" },
  { value: "feliz", label: "Feliz" },
  { value: "irritada", label: "Irritada" },
  { value: "llorona", label: "Llorona" },
  { value: "apatica", label: "Apática" },
  { value: "gremlin", label: "Gremlin" },
  { value: "cachonda", label: "Cachonda" },
];

export const SEX_ACTIVIDADES: Opcion<SexActivity>[] = [
  { value: "penetracion", label: "Con penetración" },
  { value: "oral", label: "Oral" },
  { value: "manos", label: "Manos" },
  { value: "juguetes", label: "Juguetes" },
  { value: "sola", label: "Sola" },
];

export const SEX_PROTECCION: Opcion<SexProtection>[] = [
  { value: "pastilla", label: "Pastilla" },
  { value: "condon", label: "Condón" },
  { value: "marcha-atras", label: "Marcha atrás" },
  { value: "nada", label: "Nada" },
];

/** Etiquetas de una lista de valores, en el orden en que se pintan. */
export function labelsOf<T>(opciones: Opcion<T>[], values: T[] | undefined): string[] {
  if (!values?.length) return [];
  return opciones.filter((o) => values.includes(o.value)).map((o) => o.label);
}

export function labelOf<T>(opciones: Opcion<T>[], value: T | undefined): string | undefined {
  return opciones.find((o) => o.value === value)?.label;
}
