/* ═══════════════════════════════════════════════════════════════
   NOVEDADES

   Lo que Lilita cuenta la primera vez que Lídia abre la app después
   de un despliegue con cambios que se notan. La más nueva va ARRIBA.

   Cada despliegue con algo visible añade una entrada aquí (ver
   AGENTS.md). El id no se cambia nunca una vez publicado: es lo que
   se guarda en el móvil para saber hasta dónde ha leído.
   ═══════════════════════════════════════════════════════════════ */

export type Novedad = {
  /** Único y estable. Fecha del despliegue, con sufijo si hay dos el mismo día: "2026-10-07", "2026-10-07-b" */
  id: string;
  /** Una línea, en boca de Lilita */
  titulo: string;
  /** Cada cambio en una frase corta, también en boca de Lilita */
  cambios: string[];
};

export const NOVEDADES: Novedad[] = [
  {
    id: "2026-10-08-h",
    titulo: "Ahora tu historial habla, y bastante",
    cambios: [
      "Te digo en qué día del ciclo vas, si este viene más cabrón que los anteriores y lo que te cae en los próximos días.",
      "Te dibujo tu mes tipo: regla, días fértiles, el día que más duele, PAS y Cookie Monster, cada cosa en su sitio.",
      "Ya no te enseño una sola conclusión: pasas de una a otra y las ves todas.",
      "Y te enseño cuántas veces he clavado la fecha, para que sepas cuánto fiarte de mí.",
      "Todo esto va con Plus.",
    ],
  },
  {
    id: "2026-10-08-g",
    titulo: "El botón de Plus deja de hacerse el remolón",
    cambios: ["En el iPhone, al elegir Plus ya no me quedo pensando eternamente antes de abrir la compra de Apple."],
  },
  {
    id: "2026-10-08-f",
    titulo: "Tu cuenta, tu diario y yo al otro lado",
    cambios: [
      "Ahora entras con tu cuenta: tu diario antiguo sigue guardado, pero hay que pasarlo a la cuenta que te toca, que no voy a adivinar de quién es.",
      "Con Plus ya puedo contestarte; el diario sigue siendo gratis, faltaría más.",
    ],
  },
  {
    id: "2026-10-08-e",
    titulo: "Ya me sé el nombre de tu pareja, prometido",
    cambios: [
      "Si en Ajustes le has puesto nombre a tu pareja, ahora lo sé de verdad y no me invento a otro.",
    ],
  },
  {
    id: "2026-10-08-d",
    titulo: "El diario va por mi cuenta; la charla, con Plus",
    cambios: [
      "Tu diario sigue gratis, pero para que te conteste necesitas Plus desde el primer mensaje.",
      "Plus con voz pone «Próximamente»: todavía no se compra, que no te voy a cobrar por una promesa.",
    ],
  },
  {
    id: "2026-10-08-c",
    titulo: "Plus se viene al iPhone, guapa",
    cambios: [
      "En la app del iPhone, Plus cuesta 6,99 € al mes o 49,99 € al año; los cobros los lleva Apple.",
      "Si ya lo habías comprado, toca «Restaurar compras» y recuperamos lo tuyo, que aquí no se paga dos veces por gusto.",
    ],
  },
  {
    id: "2026-10-08-b",
    titulo: "Tu pareja ahora se configura, como un mueble de IKEA",
    cambios: [
      "En Ajustes tienes «Tu pareja»: le cambias el nombre o le das la patada, y yo me adapto.",
      "Sin pareja apuntada, Cookie Monster se va a dormir y yo dejo de nombrar a nadie.",
    ],
  },
  ...(process.env.NEXT_PUBLIC_ACCOUNT_MODE === "true" ? [{
    id: "2026-10-08",
    titulo: "Tu diario ya tiene su propio sitio",
    cambios: [
      "Entra con tu correo y guardo una copia privada de tu diario, sin mezclarlo con el de nadie.",
      "En Ajustes te cuento cuánto nos queda por hablar, sin cobrarte sorpresas.",
      "Las llamadas duran hasta dos minutos: te enseño el reloj para que no nos pille a medias.",
      "A tu pareja la invitas tú, y le cierras la puerta cuando quieras.",
      "Mis recuerdos los escribes tú en Ajustes: eliges qué quieres que tenga presente cuando charlamos.",
    ],
  }] : []),
  {
    id: "2026-10-07-d",
    titulo: "Llorar y enfadarte ahora va paso a paso",
    cambios: [
      "«He llorado» te pregunta de una en una, como el registro del día: cómo de fuerte, por qué y si quieres contarme algo.",
      "Cookie Monster igual: cuánto monstruo, qué ha hecho Arnau esta vez y qué te haría falta. Y yo opino, claro.",
      "Al final te enseño cómo queda y tocas lo que quieras cambiar.",
    ],
  },
  {
    id: "2026-10-07-c",
    titulo: "El PDF para la gine ya sale, por fin",
    cambios: [
      "En el resumen para la ginecóloga, «Compartir PDF» te saca el documento de verdad y lo mandas por WhatsApp, Mail o lo guardas en Archivos.",
    ],
  },
  {
    id: "2026-10-07-b",
    titulo: "He ordenado Hoy, que no cabías",
    cambios: [
      "Mi cara ahora es enorme y ocupa todo lo que sobra. De nada.",
      "La pastilla, «He llorado» y Cookie Monster van juntos en una fila, a la vista y sin bajar.",
      "El sangrado y cómo va el día te los pregunto al tocar «Apuntar hoy».",
      "Para contestarme, toca mi bocadillo entero.",
    ],
  },
  {
    id: "2026-10-07",
    titulo: "Me he puesto al día, guapa",
    cambios: [
      "Apuntar el día ahora va de pregunta en pregunta: una cada vez, empiezo por cómo va el día y al final te enseño el resumen para que toques lo que quieras.",
      "En el chat ya no hablo en voz alta. Si quieres oírme, llámame con el teléfono.",
      "Si el cerebro que uso se atasca o se queda sin cuota, contesto con otro. Menos silencios incómodos.",
    ],
  },
];

const KEY = "lilaila:novedades-vistas";

function leer(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Marca como leído todo lo publicado hasta ahora. */
export function marcarNovedadesVistas() {
  const ultima = NOVEDADES[0];
  if (!ultima) return;
  try {
    localStorage.setItem(KEY, ultima.id);
  } catch {
    // Sin almacenamiento (modo privado): volverá a salir, y no pasa nada.
  }
}

/**
 * Lo que aún no ha visto, de más nueva a más vieja.
 *
 * Si el móvil no tiene nada guardado es que esta pantalla no existía
 * cuando abrió la app por última vez: le enseñamos solo la última
 * entrada, no el historial entero. Quien instala de cero no pasa por
 * aquí, porque el onboarding las marca todas como vistas.
 */
export function novedadesPendientes(): Novedad[] {
  const vista = leer();
  if (vista === null) return NOVEDADES.slice(0, 1);
  const i = NOVEDADES.findIndex((n) => n.id === vista);
  // Un id que ya no existe (entrada borrada): mejor la última que nada.
  if (i === -1) return NOVEDADES.slice(0, 1);
  return NOVEDADES.slice(0, i);
}
