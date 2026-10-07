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
