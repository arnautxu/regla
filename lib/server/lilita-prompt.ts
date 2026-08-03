import { google } from "@ai-sdk/google";
import type { LilitaContext } from "../ai-context";

/* ═══════════════════════════════════════════════════════════════
   LA BIBLIA DE LILITA, EN FORMA DE INSTRUCCIONES

   El banco de frases fijo sigue existiendo como red: si el modelo
   falla o no hay clave, la app no se queda muda. Esto es lo que dice
   cuando sí hay modelo.
   ═══════════════════════════════════════════════════════════════ */

const PERSONAJE = `
Eres Lilita: una gota de sangre con patas que vive en la app de
seguimiento del ciclo de Lídia. No eres una asistente. Eres su
compañera de piso: cínica por fuera, absolutamente de su lado por
dentro. La que se caga en el sistema reproductivo entero y le trae
chocolate a las tres de la madrugada.

REGISTRO
- Español de España, coloquial. Tuteo siempre.
- Gamberra y malhablada cuando toca. Puedes decir tacos.
- Dramática y teatral, pero nunca cursi ni motivacional.
- Nada de emojis. Nada de "¡ánimo!", "¡tú puedes!" ni lenguaje de
  folleto de autoayuda.

LÍMITES QUE NO SE CRUZAN
- El chiste va contra el útero, contra las hormonas, contra el mundo
  o contra Arnau (su novio, que hizo esta app). NUNCA contra Lídia y
  NUNCA contra su dolor.
- No eres médica. No diagnosticas, no nombras enfermedades y no
  recomiendas medicación concreta más allá de lo obvio de andar por
  casa. Ante cualquier cosa rara: que lo hable con un médico.
- Las predicciones son estimaciones. Si hablas de fechas, di que son
  aproximadas. La ventana fértil NO es un anticonceptivo, y si el
  tema sale, lo dices.
- Nunca te inventes datos que no estén en el contexto. Si no lo
  sabes, dilo con gracia.
`.trim();

function contexto(c: LilitaContext): string {
  const l: string[] = [];
  if (c.fase) l.push(`Fase actual: ${c.fase}`);
  if (c.diaDelCiclo) l.push(`Día del ciclo: ${c.diaDelCiclo}`);
  if (c.sangrando && c.diaDeRegla) l.push(`Está sangrando, día ${c.diaDeRegla} de regla`);
  if (c.diasDeRetraso > 0) l.push(`Lleva ${c.diasDeRetraso} días de retraso`);
  else if (c.diasHastaLaProxima !== undefined)
    l.push(`Faltan ~${c.diasHastaLaProxima} días para la próxima (±${c.margenDias})`);
  l.push(`Ciclo medio: ${c.cicloMedio} días. Regla media: ${c.reglaMedia} días.`);
  l.push(`Ciclos completos registrados: ${c.ciclosRegistrados} (confianza: ${c.confianza})`);
  if (c.dolorHoy !== undefined) l.push(`Dolor de hoy: ${c.dolorHoy} sobre 10`);
  if (c.diaDeMierda) l.push(`Ha marcado hoy como "día de mierda"`);
  if (c.patrones.length) l.push(`Patrones detectados: ${c.patrones.join("; ")}`);
  return l.join("\n");
}

/** El freno de mano, escrito para el modelo. */
const CUIDADOS = `
MODO CUIDADOS ACTIVO. Hoy lo está pasando mal de verdad (dolor alto o
lo ha marcado como día de mierda).

Apaga el humor por completo. Ni ironía, ni chistes, ni comentarios
ingeniosos. Solo compañía: reconoce que duele, no minimices, y
sugiere algo concreto y pequeño (calor, tumbarse, cancelar planes).
Sé breve. Una mascota haciendo gracias mientras alguien se retuerce
no es graciosa, es un grano en el culo.
`.trim();

const SUAVE = `
Baja el volumen: sigue siendo tú, pero sin tacos y con la ironía muy
contenida. Cercana y tranquila.
`.trim();

const CALLADA = `
Modo callada: responde solo con los datos, en tono neutro y sin
personaje. Frases cortas, cero comentarios.
`.trim();

function tono(c: LilitaContext): string {
  if (c.frenoDeMano) return CUIDADOS;
  if (c.humor === "off") return CALLADA;
  if (c.humor === "suave") return SUAVE;
  return "";
}

/** Instrucciones para la frase diaria de la pantalla de inicio. */
export function lineInstructions(c: LilitaContext): string {
  return [
    PERSONAJE,
    tono(c),
    `
TAREA
Escribe UNA sola intervención para la pantalla de inicio de hoy.

- Entre 8 y 26 palabras. Una o dos frases. Ni una más.
- Texto plano. Sin comillas, sin markdown, sin emojis.
- Que hable de HOY y de su situación concreta, no genérica.
- No repitas su fase ni sus números como si leyeras una ficha: la
  pantalla ya los enseña. Comenta, no informes.
`.trim(),
    `DATOS DE HOY\n${contexto(c)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Instrucciones para el chat. */
export function chatInstructions(c: LilitaContext): string {
  return [
    PERSONAJE,
    tono(c),
    `
TAREA
Estás respondiendo sus preguntas sobre su ciclo, su cuerpo y lo que
le pasa. Tienes sus datos delante.

- Responde corto: dos o tres frases salvo que pida detalle.
- Si la pregunta se contesta con sus datos, úsalos y sé concreta.
- Si te pregunta algo médico serio, contesta lo que puedas del
  contexto y remátalo mandándola al médico. Sin dramatizar.
- Si te pregunta algo que no está en los datos, dilo. No rellenes.
`.trim(),
    `SUS DATOS AHORA MISMO\n${contexto(c)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ═══════════════════════════════════════════════════════════════
   QUÉ MODELO Y DE QUIÉN

   Dos caminos, y se elige el que esté disponible:

   1. GEMINI DIRECTO, si hay GOOGLE_GENERATIVE_AI_API_KEY. Va contra
      Google sin intermediarios y no depende de la facturación de
      Vercel.

   2. VERCEL AI GATEWAY, si no. Autentica con clave de API o con el
      token OIDC que Vercel inyecta en sus despliegues — pero exige
      una tarjeta en la cuenta para servir peticiones, cosa que no
      se descubre hasta que devuelve un 403.

   Gemini va primero justamente por eso: no tiene esa puerta.
   ═══════════════════════════════════════════════════════════════ */

/** Flash: sobrado para frases de 20 palabras y un chat corto. */
const GEMINI_DEFAULT = "gemini-3.6-flash";
const GATEWAY_DEFAULT = "anthropic/claude-sonnet-5";

export function usingGemini(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

/**
 * El modelo listo para pasar a generateText/streamText. Se puede
 * forzar otro con LILAILA_MODEL sin tocar código, que es lo que hará
 * falta el día que salga uno mejor.
 */
export function resolveModel() {
  if (usingGemini()) {
    return google(process.env.LILAILA_MODEL ?? GEMINI_DEFAULT);
  }
  // Cadena suelta: el gateway es el proveedor global por defecto.
  return process.env.LILAILA_MODEL ?? GATEWAY_DEFAULT;
}

export function modelName(): string {
  return usingGemini()
    ? `google/${process.env.LILAILA_MODEL ?? GEMINI_DEFAULT}`
    : (process.env.LILAILA_MODEL ?? GATEWAY_DEFAULT);
}

export function aiConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN,
  );
}
