/* Lo que comparten la voz leída (/api/voz) y la conversación en
   directo (/api/voz/directo): la voz de Lilita y cómo contar los
   errores de ElevenLabs. Solo servidor: aquí se usa la clave. */

// Voz por defecto: una de las de la biblioteca de ElevenLabs que habla
// español. Para la definitiva, elige o diseña una en elevenlabs.io y
// pon su id en ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

export function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
}

/**
 * Traduce el error de ElevenLabs a algo que Arnau pueda arreglar.
 * Callarse aquí es lo peor: el altavoz no suena y nadie sabe por qué.
 */
export function explain(status: number, raw: string, permiso = "Text to Speech"): string {
  let code = "";
  let message = "";
  try {
    const d = (JSON.parse(raw) as { detail?: unknown }).detail;
    if (typeof d === "string") message = d;
    else if (d && typeof d === "object") {
      const o = d as { status?: unknown; code?: unknown; message?: unknown };
      code = String(o.status ?? o.code ?? "");
      message = String(o.message ?? "");
    }
  } catch {
    message = raw;
  }
  const all = `${code} ${message}`.toLowerCase();

  if (all.includes("unusual_activity") || all.includes("unusual activity"))
    return "ElevenLabs ha bloqueado la cuenta gratuita por usarse desde un servidor. Hace falta un plan de pago (el Starter basta).";
  if (all.includes("missing_permissions") || all.includes("permission"))
    return `La clave de ElevenLabs no tiene permiso de ${permiso}. Edítala en elevenlabs.io y actívalo.`;
  if (all.includes("quota") || all.includes("credits") || status === 402)
    return "Se han acabado los créditos de ElevenLabs de este mes.";
  if (all.includes("voice_not_found") || all.includes("voice") && status === 404)
    return "ElevenLabs no encuentra la voz. Revisa ELEVENLABS_VOICE_ID en Vercel.";
  if (all.includes("model") && (status === 400 || status === 422))
    return "ElevenLabs no acepta el modelo. Revisa ELEVENLABS_MODEL en Vercel o bórrala.";
  if (status === 401 || all.includes("invalid_api_key"))
    return "ElevenLabs no acepta la clave. Revisa ELEVENLABS_API_KEY en Vercel (sin espacios) y vuelve a desplegar.";
  if (status === 429)
    return "ElevenLabs va saturado. Prueba otra vez en un momento.";
  return `ElevenLabs ha fallado (${status}${message ? `: ${message.slice(0, 120)}` : ""}).`;
}
