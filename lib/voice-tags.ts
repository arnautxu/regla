/* ═══════════════════════════════════════════════════════════════
   ETIQUETAS DE VOZ

   Lilita escribe acotaciones como [sighs] o [laughs] para que
   ElevenLabs las interprete. Son para la voz, no para leer: el chat
   las quita del texto y, si el modelo de voz no las entiende, la ruta
   también, para que nunca se pronuncien en alto.

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

/** Los modelos de ElevenLabs que entienden etiquetas (v3 en adelante). */
export function modelSupportsTags(model: string): boolean {
  return /^eleven_v\d+/.test(model) && !/^eleven_v[12]\b/.test(model);
}
