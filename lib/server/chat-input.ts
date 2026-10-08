import { z } from "zod";

const bounded = z.number().finite().min(-1000).max(10000).optional();
export const contextSchema = z.object({
  fase: z.string().max(60).optional(), diaDelCiclo: bounded, diaDeRegla: bounded,
  sangrando: z.boolean(), diasHastaLaProxima: bounded, margenDias: bounded,
  diasDeRetraso: z.number().min(0).max(10000), cicloMedio: z.number().min(1).max(1000),
  reglaMedia: z.number().min(1).max(1000), ciclosRegistrados: z.number().min(0).max(10000),
  confianza: z.enum(["ninguna", "baja", "media", "alta"]), dolorHoy: z.number().min(0).max(10).optional(),
  diaDeMierda: z.boolean(), patrones: z.array(z.string().max(300)).max(20),
  humor: z.enum(["gamberro", "suave", "off"]), frenoDeMano: z.boolean(),
  notas: z.array(z.object({ cuando: z.string().max(60), texto: z.string().max(240) })).max(12),
  memorias: z.array(z.object({ id: z.string().max(100), texto: z.string().max(500) })).max(1000),
  puedeRecordar: z.boolean(),
}).transform(c => ({ ...c, notas: c.notas.slice(0, 3), memorias: c.memorias.slice(-8), patrones: c.patrones.slice(0, 5) }));

export const chatSchema = z.object({
  context: contextSchema,
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string().max(2000) }),
      z.object({ type: z.literal("step-start") }),
    ])).min(1).max(4),
  }).transform(m => ({ ...m, parts: m.parts.filter(p => p.type === "text") }))).min(1).max(12),
});
