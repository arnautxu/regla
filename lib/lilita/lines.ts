import type { HumorLevel } from "../db";
import type { Phase } from "../cycle";

export type Mood =
  | "neutral"
  | "exhausta"
  | "energica"
  | "flirty"
  | "gremlin"
  | "panico"
  | "cuidando"
  | "dormida"
  /** Solo para la animación de "me ha bajado" — nunca la elige lilitaSays. */
  | "volando";

export interface LineContext {
  phase?: Phase;
  /** La regla sigue abierta pero hoy no se ha registrado nada */
  pendienteDeHoy?: boolean;
  dayOfCycle?: number;
  periodDay?: number;
  daysUntilNext?: number;
  daysLate: number;
  bleeding: boolean;
  cyclesLogged: number;
  painLevel?: number;
  badDay?: boolean;
  humorLevel: HumorLevel;
}

export interface Line {
  text: string;
  mood: Mood;
}

/* ═══════════════════════════════════════════════════════════════
   EL FRENO DE MANO

   Dolor >= 8 o "día de mierda" marcado y Lilita se calla. Nada de
   chistes, nada de ironía. Solo compañía. Una mascota que hace
   gracias mientras alguien se retuerce no es graciosa, es un grano
   en el culo — y se desinstala.
   ═══════════════════════════════════════════════════════════════ */

const CUIDADOS: string[] = [
  "Vale. Hoy no hago gracias. Bolsa de agua caliente y el móvil boca abajo.",
  "Te creo. Duele. No es dramatismo tuyo, es tu útero portándose fatal.",
  "Aquí estoy. No hace falta que hagas nada más que aguantar el chaparrón.",
  "Ibuprofeno con comida, calor en la lumbar, y a la mierda los planes de hoy.",
  "Esto pasa. Mientras tanto, tienes permiso para cancelarlo todo.",
  "Si esto se repite cada mes con esta intensidad, díselo a un médico. En serio.",
  "Nadie te va a dar un premio por aguantar de pie. Túmbate.",
];

const CUIDADOS_TITULO = "Modo malo activado";

/* ═══════════════════════════════════════════════════════════════
   BANCO GAMBERRO — el registro por defecto
   ═══════════════════════════════════════════════════════════════ */

const SIN_DATOS: Line[] = [
  {
    text: "Hola. Soy Lilita. Soy una gota de sangre con patas y voy a vivir en tu móvil.",
    mood: "neutral",
  },
  {
    text: "No sé nada de ti todavía. Dime cuándo te bajó y empezamos a llevar las cuentas.",
    mood: "neutral",
  },
  {
    text: "Pantalla vacía, como mi conocimiento de tu ciclo. Dale al botón rojo cuando toque.",
    mood: "neutral",
  },
  {
    text: "Todavía no tengo ni idea de tu ciclo. Cuéntamelo y empiezo a hacer cuentas.",
    mood: "neutral",
  },
  {
    text: "Aquí no hay nada mío que decir todavía. La pantalla en blanco eres tú, sin datos.",
    mood: "neutral",
  },
  {
    text: "Primer día conmigo. Dame algo que apuntar y dejo de estar tan callada.",
    mood: "neutral",
  },
];

const PRIMER_CICLO: Line[] = [
  {
    text: "Un ciclo registrado. Con uno solo no puedo predecir nada, así que no me preguntes.",
    mood: "neutral",
  },
  {
    text: "Ya tenemos un dato. Con tres empiezo a adivinar. Con seis me pongo chulita.",
    mood: "neutral",
  },
  {
    text: "Segundo ciclo en marcha. Todavía adivino a ciegas, pero ya menos.",
    mood: "neutral",
  },
  {
    text: "Con esto ya son dos. Empiezo a intuir un patrón, no me hagas mucho caso aún.",
    mood: "neutral",
  },
  {
    text: "Cuatro ciclos y voy afinando la puntería. Cinco y ya presumo.",
    mood: "neutral",
  },
];

const MENSTRUAL: Record<number, Line[]> = {
  1: [
    { text: "Día 1. Ha llegado. Que empiece el espectáculo.", mood: "exhausta" },
    {
      text: "Y aquí estamos otra vez. Puntual como una desgracia.",
      mood: "exhausta",
    },
    {
      text: "Día 1. El útero ha empezado las obras y no ha pedido licencia.",
      mood: "exhausta",
    },
    {
      text: "Ha llegado. Como siempre, sin avisar y con mala educación.",
      mood: "exhausta",
    },
    {
      text: "Bienvenida al primer acto. El público no aplaude, pero yo sí, un poco.",
      mood: "exhausta",
    },
    {
      text: "Hoy toca. Bolsa de agua caliente, pijama, y el mundo espera.",
      mood: "exhausta",
    },
    {
      text: "Se ha abierto el telón. Trágico, previsible, puntual.",
      mood: "exhausta",
    },
    {
      text: "Día 1. Otra vez esta obra, otra vez sin ensayo.",
      mood: "exhausta",
    },
  ],
  2: [
    {
      text: "Día 2. El peor. Mañana ya no es tan peor. Aguanta.",
      mood: "exhausta",
    },
    {
      text: "Día 2: manta, sofá, y que el mundo se organice sin ti.",
      mood: "exhausta",
    },
    {
      text: "Hoy tienes derecho constitucional a no hacer absolutamente nada.",
      mood: "exhausta",
    },
    {
      text: "Día 2, el más largo del calendario aunque dure 24 horas como los demás.",
      mood: "exhausta",
    },
    {
      text: "Hoy no eres tú, es tu útero con el micrófono abierto.",
      mood: "exhausta",
    },
    {
      text: "El peor día tiene fecha de caducidad. Es mañana. Aguanta hoy.",
      mood: "exhausta",
    },
    {
      text: "Manta, sofá y cero explicaciones a nadie. Día 2 lo pide.",
      mood: "exhausta",
    },
    {
      text: "Si hoy cancelas planes, hiciste bien. Firmado: yo.",
      mood: "exhausta",
    },
  ],
  3: [
    {
      text: "Día 3. Ya se ve la salida del túnel. Sigue siendo un túnel, pero se ve.",
      mood: "exhausta",
    },
    {
      text: "Día 3. Menos sangre, misma mala hostia. Es lo que hay.",
      mood: "exhausta",
    },
    {
      text: "Día 3. Baja la intensidad, no la mala leche. Vas mejorando.",
      mood: "exhausta",
    },
    {
      text: "A partir de hoy cuenta menos y molesta menos. Progreso real.",
      mood: "exhausta",
    },
    {
      text: "Día 3, mitad del drama ya representada. Sigue el guion.",
      mood: "exhausta",
    },
    {
      text: "Menos manchas, menos dolor, la misma cara de circunstancias.",
      mood: "exhausta",
    },
  ],
  4: [
    {
      text: "Día 4. Esto ya es el epílogo. Casi.",
      mood: "neutral",
    },
    {
      text: "Día 4 y ya casi eres persona otra vez.",
      mood: "neutral",
    },
    {
      text: "Día 4. Ya se puede planear algo que no sea sobrevivir.",
      mood: "neutral",
    },
    {
      text: "Casi persona otra vez. El útero recoge sus cosas.",
      mood: "neutral",
    },
    {
      text: "Día 4 y el drama baja el volumen. Se agradece.",
      mood: "neutral",
    },
    {
      text: "Cuarto acto. Ya sabes cómo termina esto: bien, más o menos.",
      mood: "neutral",
    },
  ],
  5: [
    { text: "Día 5. Recta final. Marca «Nada» el día que pare.", mood: "neutral" },
    {
      text: "Día 5. Si esto sigue mucho más, avísame y lo apuntamos como largo.",
      mood: "neutral",
    },
    {
      text: "Día 5. Si esto sigue, dímelo y lo llevamos aparte.",
      mood: "neutral",
    },
    {
      text: "Últimos coletazos. Marca «Nada» en cuanto pare de verdad.",
      mood: "neutral",
    },
    {
      text: "Día 5, telón a punto de bajar. Buen trabajo, como siempre.",
      mood: "neutral",
    },
    {
      text: "Se acaba. Si no se acaba pronto, avísame y lo vigilamos.",
      mood: "neutral",
    },
  ],
};

/* Regla en marcha pero hoy sin marcar. Antes caia en el banco de
   "dia 1" y soltaba "el utero ha empezado las obras" en el dia 3,
   inventandose un dato que nadie le habia dado. */
const PENDIENTE_HOY: Line[] = [
  { text: "Ayer sí. ¿Y hoy? Marca el flujo y sigo contando.", mood: "neutral" },
  {
    text: "Me falta el parte de hoy. ¿Sigue la cosa o ya se ha ido?",
    mood: "neutral",
  },
  {
    text: "No sé cómo vas hoy. Un toque en el flujo y me entero.",
    mood: "neutral",
  },
  {
    text: "¿Sigue la regla o ya se fue? Marca el flujo y salgo de dudas.",
    mood: "neutral",
  },
  {
    text: "Tengo el dato de ayer, no el de hoy. Un toque y me pongo al día.",
    mood: "neutral",
  },
  {
    text: "No sé si hoy toca todavía. Dímelo con el flujo, no conmigo.",
    mood: "neutral",
  },
];

const MENSTRUAL_LARGA: Line[] = [
  {
    text: "Llevas más de una semana sangrando. Eso ya no es normal-normal. Consúltalo.",
    mood: "neutral",
  },
  {
    text: "Séptimo día o más. ¿Sigue de verdad o se te ha olvidado marcar que paró?",
    mood: "neutral",
  },
  {
    text: "Ocho días y contando. Yo apunto, pero esto ya lo hablaría con un médico.",
    mood: "neutral",
  },
  {
    text: "Esto se está alargando más de lo normal-normal. No lo ignores.",
    mood: "neutral",
  },
  {
    text: "Novena jornada. O sigue de verdad, o se te olvidó cerrarlo. Compruébalo.",
    mood: "neutral",
  },
];

const FOLICULAR: Line[] = [
  {
    text: "Se acabó. Ahora vienen los días buenos. Aprovéchalos, duran tres.",
    mood: "energica",
  },
  {
    text: "Te noto con ganas de reorganizar la cocina. Es hormonal. Disfrútalo igual.",
    mood: "energica",
  },
  {
    text: "Energía en subida. Es el momento de hacer lo que llevas dos semanas evitando.",
    mood: "energica",
  },
  {
    text: "Hoy te caes bien a ti misma. Anótalo, que dura poco.",
    mood: "energica",
  },
  {
    text: "Piel decente, humor decente, mundo tolerable. Fase folicular, señores.",
    mood: "energica",
  },
  {
    text: "Fase folicular: la versión de ti que sí contesta los mensajes.",
    mood: "energica",
  },
  {
    text: "Hoy rindes el doble y te enteras la mitad tarde. Aprovecha mientras dure.",
    mood: "energica",
  },
  {
    text: "Ganas de todo, energía de sobra. Que no se note que es hormonal.",
    mood: "energica",
  },
  {
    text: "Buena racha en marcha. No la analices, solo úsala.",
    mood: "energica",
  },
];

const OVULACION: Line[] = [
  {
    text: "Ventana fértil. Si follas, ponte algo. Yo solo digo cosas.",
    mood: "flirty",
  },
  {
    text: "Fértil como un campo de trigo. Actúa en consecuencia, sea cual sea tu consecuencia.",
    mood: "flirty",
  },
  {
    text: "Hoy hueles bien sin haber hecho nada. La biología es una cotilla.",
    mood: "flirty",
  },
  {
    text: "Modo depredadora activado. No es cosa tuya, es un pico de estrógenos.",
    mood: "flirty",
  },
  {
    text: "Aviso: esto es una estimación, no un método anticonceptivo. Que quede claro.",
    mood: "flirty",
  },
  {
    text: "Pico de fertilidad. Tú sabrás qué haces con esa información.",
    mood: "flirty",
  },
  {
    text: "Hoy ligas hasta con el cartero. No es magia, es biología presumiendo.",
    mood: "flirty",
  },
  {
    text: "Ventana fértil activa. Repito: estimación, no anticonceptivo.",
    mood: "flirty",
  },
  {
    text: "Te miras al espejo y apruebas. Disfrútalo, dura tres días.",
    mood: "flirty",
  },
];

const LUTEA: Line[] = [
  {
    text: "Empieza la cuesta abajo. Si hoy lloras con un anuncio, es normal.",
    mood: "gremlin",
  },
  {
    text: "Fase lútea. Todo el mundo te parece imbécil. Puede que tengas razón.",
    mood: "gremlin",
  },
  {
    text: "Antojos entrando por la izquierda. No los negocies, no se puede razonar con ellos.",
    mood: "gremlin",
  },
  {
    text: "Si hoy le gritas a Arnau, que sepas que yo lo he visto y estaba justificado.",
    mood: "gremlin",
  },
  {
    text: "Tetas doloridas, paciencia cero, hambre infinita. El pack completo.",
    mood: "gremlin",
  },
  {
    text: "No estás loca. Estás en la fase lútea. Es distinto y es temporal.",
    mood: "gremlin",
  },
  {
    text: "Fase lútea. Si el mundo te cae mal hoy, no eres tú, es el calendario.",
    mood: "gremlin",
  },
  {
    text: "Paciencia a la baja, antojos al alza. Combinación clásica.",
    mood: "gremlin",
  },
  {
    text: "Hoy todo te parece una ofensa personal. Bienvenida a la lútea.",
    mood: "gremlin",
  },
  {
    text: "Si lloras viendo un anuncio de seguros, esto lo explica todo.",
    mood: "gremlin",
  },
];

const INMINENTE: Line[] = [
  {
    text: "Mañana o pasado. Mete algo en el bolso, hazme caso.",
    mood: "gremlin",
  },
  {
    text: "Esto cae de un momento a otro. No estrenes ropa interior cara.",
    mood: "gremlin",
  },
  {
    text: "Últimos días de calma. Compra chocolate ahora, luego no querrás salir.",
    mood: "gremlin",
  },
  {
    text: "Se acerca. Lleva compresa de repuesto, que luego no hay tiempo.",
    mood: "gremlin",
  },
  {
    text: "Cuenta atrás corta. El útero ya está haciendo las maletas.",
    mood: "gremlin",
  },
  {
    text: "Días contados para que caiga. No hagas planes con ropa clara.",
    mood: "gremlin",
  },
];

const HOY_TOCA: Line[] = [
  {
    text: "Hoy es el día previsto. O no. El útero es un artista, no un tren suizo.",
    mood: "panico",
  },
  {
    text: "Según mis cuentas, hoy. Según tu cuerpo, ya veremos.",
    mood: "panico",
  },
  {
    text: "Hoy toca, según el cálculo. El cuerpo no siempre lee el calendario.",
    mood: "panico",
  },
  {
    text: "Fecha prevista: hoy. Que no venga es tan normal como que venga.",
    mood: "panico",
  },
  {
    text: "Es el día que yo tenía apuntado. El útero decidirá si coincide.",
    mood: "panico",
  },
];

const RETRASO: Record<string, Line[]> = {
  poco: [
    {
      text: "Un día tarde. Ni caso. Un día tarde no es nada, en serio.",
      mood: "neutral",
    },
    {
      text: "Vas con un día de retraso. Respira. Esto pasa constantemente.",
      mood: "neutral",
    },
    {
      text: "Dos días. Sigue siendo territorio absolutamente normal.",
      mood: "neutral",
    },
    {
      text: "Tres días tarde, todavía dentro de lo esperable. Sin sustos.",
      mood: "neutral",
    },
    {
      text: "Un poco de retraso no es noticia. El cuerpo también tiene días malos.",
      mood: "neutral",
    },
  ],
  medio: [
    {
      text: "Cuatro días tarde. Puede ser estrés, viaje, dormir mal o nada. Suele ser nada.",
      mood: "panico",
    },
    {
      text: "Vamos tarde. No entremos en pánico las dos a la vez, que ya lo hago yo.",
      mood: "panico",
    },
    {
      text: "Cinco días. Podría ser estrés, podría ser nada. Suele ser nada.",
      mood: "panico",
    },
    {
      text: "Vamos con retraso de verdad. Respira, esto no siempre significa algo.",
      mood: "panico",
    },
    {
      text: "Una semana casi. Yo no salto a conclusiones, pero las tengo cerca.",
      mood: "panico",
    },
  ],
  mucho: [
    {
      text: "Más de una semana. Si te preocupa, un test cuesta tres euros y quita el ruido de la cabeza.",
      mood: "panico",
    },
    {
      text: "Diez días o más. Yo solo soy una gota de sangre animada, pero aquí ya hablaría con alguien con carrera.",
      mood: "panico",
    },
    {
      text: "Doce días de retraso. Yo apunto números, no diagnósticos. Habla con alguien.",
      mood: "panico",
    },
    {
      text: "Esto ya se sale de lo que yo puedo explicarte con gracia.",
      mood: "panico",
    },
    {
      text: "Más de una semana y media. El chiste se acaba aquí: consulta.",
      mood: "panico",
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════
   BANCO SUAVE — cuando baja el volumen desde ajustes
   ═══════════════════════════════════════════════════════════════ */

const SUAVE: Record<Phase | "sin-datos" | "retraso", Line[]> = {
  "sin-datos": [
    { text: "Hola. Registra tu primer día y empezamos.", mood: "neutral" },
  ],
  menstrual: [
    { text: "Primeros días. Cuídate y ve con calma.", mood: "exhausta" },
    { text: "Estás en la regla. Descansa lo que necesites.", mood: "exhausta" },
  ],
  folicular: [
    { text: "Fase folicular. La energía suele volver estos días.", mood: "energica" },
  ],
  ovulacion: [
    { text: "Ventana fértil estimada. Recuerda que es solo una estimación.", mood: "flirty" },
  ],
  lutea: [
    { text: "Fase lútea. Es normal notar el ánimo más variable.", mood: "gremlin" },
  ],
  retraso: [
    { text: "Vas algo más tarde de lo previsto. Suele no significar nada.", mood: "neutral" },
  ],
};

/* ═══════════════════════════════════════════════════════════════
   SELECCIÓN

   La frase es estable durante todo el día: se elige con una semilla
   derivada de la fecha. Si cambiara en cada render, leerla a medias
   y perderla sería un bug con cara de fantasma.
   ═══════════════════════════════════════════════════════════════ */

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(pool: T[], seed: string): T {
  return pool[seedFrom(seed) % pool.length];
}

export function lilitaSays(ctx: LineContext, dateKey: string): Line {
  // --- Freno de mano. Primero, antes que nada.
  if (ctx.badDay || (ctx.painLevel ?? 0) >= 8) {
    return { text: pick(CUIDADOS, dateKey + "cuidados"), mood: "cuidando" };
  }

  if (ctx.humorLevel === "off") {
    return { text: factual(ctx), mood: "neutral" };
  }

  const soft = ctx.humorLevel === "suave";

  if (ctx.cyclesLogged === 0 && ctx.dayOfCycle === undefined) {
    return soft
      ? pick(SUAVE["sin-datos"], dateKey)
      : pick(SIN_DATOS, dateKey);
  }

  // --- Retraso: manda sobre la fase.
  if (ctx.daysLate > 0) {
    if (soft) return pick(SUAVE.retraso, dateKey);
    const bucket = ctx.daysLate <= 2 ? "poco" : ctx.daysLate <= 6 ? "medio" : "mucho";
    return pick(RETRASO[bucket], dateKey + bucket);
  }

  if (soft && ctx.phase) return pick(SUAVE[ctx.phase], dateKey);

  // --- Regla abierta y hoy en blanco: pedir el dato, no inventarlo.
  if (ctx.pendienteDeHoy && !soft) return pick(PENDIENTE_HOY, dateKey);

  // --- Sangrando: la frase depende del día de regla.
  if (ctx.bleeding && ctx.periodDay) {
    if (ctx.periodDay >= 7) return pick(MENSTRUAL_LARGA, dateKey);
    const pool = MENSTRUAL[Math.min(ctx.periodDay, 5)] ?? MENSTRUAL[5];
    return pick(pool, dateKey + ctx.periodDay);
  }

  // --- Cuenta atrás.
  if (ctx.daysUntilNext === 0) return pick(HOY_TOCA, dateKey);
  if (ctx.daysUntilNext !== undefined && ctx.daysUntilNext <= 3) {
    return pick(INMINENTE, dateKey);
  }

  if (ctx.cyclesLogged === 0) return pick(PRIMER_CICLO, dateKey);

  switch (ctx.phase) {
    case "folicular":
      return pick(FOLICULAR, dateKey);
    case "ovulacion":
      return pick(OVULACION, dateKey);
    case "lutea":
      return pick(LUTEA, dateKey);
    case "menstrual":
      return pick(MENSTRUAL[1], dateKey);
    default:
      return pick(SIN_DATOS, dateKey);
  }
}

/** Humor apagado: los datos y nada más. */
function factual(ctx: LineContext): string {
  if (ctx.dayOfCycle === undefined) return "Sin datos todavía.";
  if (ctx.daysLate > 0) return `${ctx.daysLate} días de retraso.`;
  if (ctx.bleeding && ctx.periodDay) return `Día ${ctx.periodDay} de regla.`;
  if (ctx.daysUntilNext === 0) return "Inicio previsto para hoy.";
  if (ctx.daysUntilNext !== undefined) {
    return `Quedan ${ctx.daysUntilNext} días para el inicio previsto.`;
  }
  return `Día ${ctx.dayOfCycle} del ciclo.`;
}

export { CUIDADOS_TITULO };
