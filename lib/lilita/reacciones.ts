import type { FaceMood } from "@/components/lilita-face";
import type { AngerLevel, AngerNeed, AngerReason, CryReason, FlowLevel, MoodTag, SymptomTag } from "../db";

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

/* ── PAS ──────────────────────────────────────────────────────────
   Llorando, nada de gracias: Lilita acompaña y ya. */

export const REACCION_PAS_INTENSIDAD: Record<1 | 2 | 3, Reaccion> = {
  1: { texto: "Un poquito. Aquí estoy.", cara: "cuidando" },
  2: { texto: "Vale. Respira conmigo.", cara: "cuidando" },
  3: { texto: "Uf. Ven aquí.", cara: "llorando" },
};

export const REACCION_PAS_MOTIVO: Record<CryReason, Reaccion> = {
  estres: { texto: "Demasiadas cosas a la vez.", cara: "cuidando" },
  discusion: { texto: "Las discusiones dejan tocada.", cara: "cuidando" },
  dolor: { texto: "Doler cansa. Mímate.", cara: "cuidando" },
  tristeza: { texto: "Llorar también limpia.", cara: "llorando" },
  alegria: { texto: "¡De las buenas! Me encanta.", cara: "energica" },
  "no-se": { texto: "A veces sale y ya. Válido.", cara: "neutral" },
  otro: { texto: "Apuntado.", cara: "neutral" },
};

/* ── Cookie Monster ───────────────────────────────────────────────
   Aquí sí puede ser gamberra: el enfado es con Arnau, no con ella. */

export const REACCION_ENFADO_NIVEL: Record<AngerLevel, Reaccion> = {
  1: { texto: "Un mordisquito. Arnau sobrevivirá.", cara: "gremlin" },
  2: { texto: "Bastante. Que se vaya preparando.", cara: "enfadada" },
  3: { texto: "MONSTRUO TOTAL. Arnau, corre.", cara: "enfadada" },
};

export const REACCION_ENFADO_MOTIVO: Record<AngerReason, Reaccion> = {
  "algo-dicho": { texto: "Esa boquita, Arnau…", cara: "enfadada" },
  "algo-hecho": { texto: "Apuntado. Lo va a pagar.", cara: "enfadada" },
  "no-has-hecho": { texto: "Clásico. Muy de Arnau.", cara: "gremlin" },
  "no-me-escuchas": { texto: "¿Hola? ¿Arnau? ¿Hay alguien?", cara: "enfadada" },
  cansada: { texto: "Cansada y con Arnau cerca. Mala mezcla.", cara: "exhausta" },
  hambre: { texto: "Enfadambre. Lo más peligroso.", cara: "gremlin" },
  "no-se": { texto: "No hace falta motivo. Estás en tu derecho.", cara: "gremlin" },
};

export const REACCION_ENFADO_NECESITA: Record<AngerNeed, Reaccion> = {
  abrazo: { texto: "Abrazo de oso, pero que no hable.", cara: "cuidando" },
  espacio: { texto: "Distancia de seguridad activada.", cara: "neutral" },
  perdon: { texto: "Y un perdón de los buenos.", cara: "enfadada" },
  hablar: { texto: "Con calma. Bueno, intentadlo.", cara: "neutral" },
  comida: { texto: "Arnau: comida. YA.", cara: "gremlin" },
  nada: { texto: "Se pasará. Tú mandas.", cara: "neutral" },
};
