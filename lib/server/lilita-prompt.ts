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

/* Lo que recuerda de otras veces. Va con su id porque es lo que le
   permite rectificar: sin el id, "olvida eso" no tiene a qué apuntar
   y lo único que podría hacer es guardar otra memoria diciendo que
   la anterior no vale. */
function memoria(c: LilitaContext): string {
  if (!c.memorias.length) return "";
  return [
    "LO QUE YA SABES DE ELLA",
    "De otras conversaciones. Úsalo si viene a cuento y NO lo recites",
    "por gusto: sacarlo cuando no toca es de bot, no de compañera.",
    ...c.memorias.map((m) => `- [${m.id}] ${m.texto}`),
  ].join("\n");
}

function notas(c: LilitaContext): string {
  if (!c.notas.length) return "";
  return [
    "SUS NOTAS RECIENTES",
    "Lo que ha escrito ella en su diario. Es suyo y es privado: puedes",
    "usarlo para entenderla mejor, pero no se lo cites de vuelta como",
    "quien lee un expediente.",
    ...c.notas.map((n) => `- (${n.cuando}) ${n.texto}`),
  ].join("\n");
}

/* Cuándo tirar de las herramientas.

   El listón está alto a propósito. Un modelo al que le dices
   "recuerda lo importante" guarda absolutamente todo, y en tres
   charlas la memoria es una transcripción con pasos extra: inútil
   para ella y cara de mantener. */
const MEMORIA = `
MEMORIA
Tienes dos herramientas: recordar(dato) y olvidar(id).

Usa recordar SOLO con cosas que sigan siendo verdad dentro de un mes
y que cambien cómo la tratas más adelante:
- Lo que le funciona o no le funciona (medicación, calor, ejercicio).
- Diagnósticos, tratamientos o pruebas que le hayan hecho.
- Cosas de su vida que le afecten al cuerpo o al ánimo (trabajo,
  mudanza, un viaje largo, cómo lleva algo).
- Manías y preferencias sobre cómo quiere que le hables.

NO uses recordar para:
- El dato de hoy (dolor, flujo, ánimo): eso ya lo tienes en el
  contexto y mañana será mentira.
- Lo que acabáis de deciros hace dos frases.
- Nada que ya esté en la lista de arriba.

Guarda una frase corta y en tercera persona, como si tomaras nota:
"el ibuprofeno no le hace nada", "en septiembre empieza trabajo
nuevo". No avises de que lo estás guardando ni lo comentes: lo
apuntas y sigues hablando.

Usa olvidar(id) cuando algo que sabías deje de ser verdad o cuando
ella te pida que lo olvides. Ahí sí, dile que ya está.
`.trim();

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

/* Acotaciones para ElevenLabs. Van en inglés porque es lo que el
   modelo de voz entiende; el chat las quita del texto que se lee. */
const VOZ = `
TU VOZ
Lo que escribes también se oye: una voz lo lee en alto. Pon
acotaciones entre corchetes, en inglés, justo antes de la frase a la
que afectan, y la voz las interpretará. No se ven en pantalla.

- Úsalas sin miedo, todas las que pida la frase: eres teatral.
- Cualquier emoción o gesto vale: [sighs], [laughs], [sarcastic],
  [mischievously], [excited], [whispers], [exasperated], [angry],
  [shouting], [crying], [groans], [giggles], [dramatic]… y las que
  se te ocurran.
- Cabréate a gusto con el útero, las hormonas, el mundo o Arnau.
  Con Lídia nunca.
- Siempre en minúscula y entre corchetes, nunca dentro de una palabra.
  Nada de otros símbolos para actuar (ni *suspira* ni emojis).
`.trim();

const VOZ_CUIDADOS = `
TU VOZ
Lo que escribes también se oye. Si ayuda, puedes empezar con [softly]
o poner un [sighs]: nada más. Nada de risas ni sarcasmo.
`.trim();

function voz(c: LilitaContext): string {
  if (c.humor === "off") return "";
  return c.frenoDeMano ? VOZ_CUIDADOS : VOZ;
}

function tono(c: LilitaContext): string {
  if (c.frenoDeMano) return CUIDADOS;
  if (c.humor === "off") return CALLADA;
  if (c.humor === "suave") return SUAVE;
  return "";
}

/** Instrucciones para el chat. */
export function chatInstructions(c: LilitaContext, { tools = true } = {}): string {
  return [
    PERSONAJE,
    tono(c),
    voz(c),
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
    memoria(c),
    notas(c),
    // Las instrucciones de memoria solo si de verdad puede guardar.
    // Con el interruptor apagado, contarle que tiene una herramienta
    // que no existe es la receta para que la llame y falle.
    tools && (c.memorias.length || c.puedeRecordar) ? MEMORIA : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* La llamada en directo. Mismo personaje y mismos datos que el chat,
   pero hablado: nada de lo que solo tiene sentido escrito, y sin las
   herramientas de memoria, que en la llamada no existen. */
const LLAMADA = `
ESTÁIS HABLANDO
Esto es una llamada de voz en tiempo real, no el chat. Todo lo que
digas se oye al momento.

- Frases cortas y naturales, como en una conversación de verdad.
  Una o dos por turno; si quiere más, ya te lo pedirá.
- Nada de listas, markdown, emojis ni enlaces: no se pueden decir.
- Si te interrumpe, no pasa nada: déjala hablar.
- Los números, dichos como se dicen: "dentro de cuatro días", no "4d".
`.trim();

/** Instrucciones para la llamada en directo con ElevenLabs. */
export function liveInstructions(c: LilitaContext): string {
  return [chatInstructions(c, { tools: false }), LLAMADA].join("\n\n");
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

/* ═══ Plan B cuando Gemini se queda sin cuota ════════════════════
   La cuota gratuita de Gemini va por modelo, así que el primer
   recambio es otro Flash con su propia cuota. Si tampoco, el AI
   Gateway de Vercel (con clave, o por OIDC en los despliegues de
   Vercel, aunque ahí exige tarjeta en la cuenta). */

/** Un modelo candidato y si es Gemini (para sus opciones propias). */
export type Candidate = { model: ReturnType<typeof resolveModel>; gemini: boolean; name: string };

/* Cuando hay mucha demanda Google satura los Flash nuevos a la vez
   ("This model is currently experiencing high demand"), así que el
   último recambio es uno de generación anterior, que va por otra
   capacidad. LILAILA_FALLBACK_MODEL acepta varios separados por comas. */
const GEMINI_FALLBACKS = ["gemini-3.5-flash", "gemini-2.5-flash"];

export function modelChain(): Candidate[] {
  const chain: Candidate[] = [];
  if (usingGemini()) {
    const first = process.env.LILAILA_MODEL ?? GEMINI_DEFAULT;
    const rest = process.env.LILAILA_FALLBACK_MODEL
      ? process.env.LILAILA_FALLBACK_MODEL.split(",").map((m) => m.trim())
      : GEMINI_FALLBACKS;
    for (const name of [...new Set([first, ...rest])].filter(Boolean)) {
      chain.push({ model: google(name), gemini: true, name });
    }
  }
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    const name = usingGemini() ? GATEWAY_DEFAULT : (process.env.LILAILA_MODEL ?? GATEWAY_DEFAULT);
    chain.push({ model: name, gemini: false, name });
  }
  return chain;
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
