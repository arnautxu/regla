import type { FaceMood } from "@/components/lilita-face";
import type { FlowLevel, MoodTag, SymptomTag } from "../db";

/* ═══════════════════════════════════════════════════════════════
   LILITA CONTESTA A CADA RESPUESTA

   En la ficha por pasos Lilita hace las preguntas, así que tiene que
   enterarse de lo que le dicen: una frase corta y una cara al tocar
   cada botón. Corta de verdad: se lee en el medio segundo antes de
   pasar a la siguiente pregunta, y si no se lee no pasa nada.

   Con «De mierda» (el freno de mano) no hace gracias: si el día es
   así, lo último que hace falta es una mascota graciosa.
   ═══════════════════════════════════════════════════════════════ */

export interface Reaccion {
  texto: string;
  cara: FaceMood;
}

export function reaccionFlujo(v: FlowLevel, acabaRegla: boolean): Reaccion {
  if (v === 0) {
    return acabaRegla
      ? { texto: "¡Se acabó! Libre otra vez.", cara: "energica" }
      : { texto: "Nada. Día limpio.", cara: "neutral" };
  }
  return (
    {
      1: { texto: "Poquito. Vale.", cara: "neutral" },
      2: { texto: "Lo normal. Apuntado.", cara: "neutral" },
      3: { texto: "Mucho… ánimo con eso.", cara: "cuidando" },
      4: { texto: "Diluvio. Te mando una manta.", cara: "panico" },
    } as const
  )[v];
}

export function reaccionDia(pain: number, bad: boolean): Reaccion {
  if (bad) return { texto: "Vale. Hoy sin bromas.", cara: "exhausta" };
  if (pain >= 7) return { texto: "Uf. Hoy toca mimarte.", cara: "cuidando" };
  if (pain >= 3) return { texto: "Regular también cuenta.", cara: "neutral" };
  return { texto: "¡Eso me gusta!", cara: "energica" };
}

export const REACCION_SINTOMA: Record<SymptomTag, Reaccion> = {
  retortijones: { texto: "Bolsa de agua caliente, ya.", cara: "cuidando" },
  "dolor-lumbar": { texto: "Esa espalda… estírate un poco.", cara: "cuidando" },
  "tetas-doloridas": { texto: "Frágiles hoy. Ojo con los abrazos.", cara: "neutral" },
  migrana: { texto: "Luz baja y silencio.", cara: "exhausta" },
  hinchazon: { texto: "Modo globo. Pasará.", cara: "gremlin" },
  cansancio: { texto: "Siesta autorizada.", cara: "dormida" },
  insomnio: { texto: "Esta noche, a por ello.", cara: "dormida" },
  antojos: { texto: "¿Chocolate? Chocolate.", cara: "gremlin" },
  acne: { texto: "Ni se nota, de verdad.", cara: "neutral" },
  cagalera: { texto: "Ten el baño cerca.", cara: "panico" },
};

export const REACCION_ANIMO: Record<MoodTag, Reaccion> = {
  tranquila: { texto: "Qué paz.", cara: "neutral" },
  feliz: { texto: "¡Así sí!", cara: "energica" },
  irritada: { texto: "Que nadie te toque hoy.", cara: "enfadada" },
  llorona: { texto: "Llorar también limpia.", cara: "llorando" },
  apatica: { texto: "Modo sofá. Válido.", cara: "exhausta" },
  gremlin: { texto: "Se viene caos.", cara: "gremlin" },
  cachonda: { texto: "Uy, uy, uy.", cara: "flirty" },
};

export function reaccionPastilla(tomada: boolean): Reaccion {
  return tomada
    ? { texto: "¡Bien! Una menos.", cara: "energica" }
    : { texto: "Apuntado. Sin dramas.", cara: "cuidando" };
}

export function reaccionSexo(si: boolean): Reaccion {
  return si
    ? { texto: "Cuéntame… o no.", cara: "flirty" }
    : { texto: "Apuntado.", cara: "neutral" };
}
