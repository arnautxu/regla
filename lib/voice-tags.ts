/* ═══════════════════════════════════════════════════════════════
   ETIQUETAS DE VOZ

   En las llamadas Lilita dice acotaciones como [sighs] o [laughs]
   para que ElevenLabs las interprete. Son para la voz, no para leer:
   la pantalla de la llamada y el chat (por si alguna se cuela) las
   quitan del texto.

   Solo cuenta como etiqueta una palabra o dos en minúsculas entre
   corchetes, sin "(" detrás: así un enlace markdown no se confunde.
   ═══════════════════════════════════════════════════════════════ */

const TAG = /\s*\[[a-z][a-z' -]{1,30}\](?!\()/gi;
/** Una etiqueta a medio llegar mientras el texto aún se escribe. */
const PARTIAL = /\s*\[[a-z' -]*$/i;

export function stripVoiceTags(text: string): string {
  return text
    .replace(TAG, " ")
    .replace(PARTIAL, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?…])/g, "$1")
    .trim();
}

