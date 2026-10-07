import { cookies } from "next/headers";
import { SESSION_COOKIE, requireSession } from "@/lib/server/auth";
import { explain, voiceId } from "@/lib/server/elevenlabs";
import { modelSupportsTags, stripVoiceTags } from "@/lib/voice-tags";

/* ═══════════════════════════════════════════════════════════════
   LA VOZ DE LILITA (ElevenLabs)

   El móvil manda el texto que Lilita acaba de escribir en el chat y
   esto devuelve el audio. La clave de ElevenLabs vive aquí y nunca
   viaja al móvil.

   Sin ELEVENLABS_API_KEY no pasa nada: el GET dice que no hay voz, el
   chat no enseña el altavoz y Lilita sigue escribiendo como siempre.

   Lo que sale hacia ElevenLabs es SOLO la respuesta de Lilita, nunca
   lo que escribe Lídia ni su registro: el mismo criterio de siempre
   sobre qué sale del móvil.
   ═══════════════════════════════════════════════════════════════ */

export const maxDuration = 30;

/** Respuestas más largas se cortan: Lilita no suelta discursos. */
const MAX_CHARS = 1200;

// v4: entiende las etiquetas de emoción ([sighs], [laughs]…) que
// escribe Lilita. Cuesta el doble por carácter que Flash y tarda más
// en empezar (segundos, no milisegundos); para Lilita, que contesta
// cuando acaba de escribir, compensa.
const DEFAULT_MODEL = "eleven_v4";
// Si el modelo expresivo falla por algo que no es la cuenta, se
// reintenta con el rápido y sin etiquetas: mejor plana que muda.
const FALLBACK_MODEL = "eleven_flash_v2_5";

function voiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function GET() {
  return Response.json({ enabled: voiceConfigured() });
}

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json({ error: "Voz no configurada." }, { status: 503 });
  }

  const jar = await cookies();
  const denied = await requireSession(jar.get(SESSION_COOKIE)?.value);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? clean(body.text) : "";
  if (!text) {
    return Response.json({ error: "No hay nada que decir." }, { status: 400 });
  }

  const voice = voiceId();
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  const tts = (modelId: string) =>
    fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify(requestBody(modelId, text)),
      },
    ).catch(() => null);

  let upstream = await tts(model);
  if (
    upstream &&
    !upstream.ok &&
    model !== FALLBACK_MODEL &&
    [400, 404, 422].includes(upstream.status)
  ) {
    const detail = await upstream.text().catch(() => "");
    console.error("ElevenLabs", model, upstream.status, detail.slice(0, 500));
    upstream = await tts(FALLBACK_MODEL);
  }

  if (!upstream) {
    return Response.json(
      { error: "No he podido llegar a ElevenLabs. Prueba otra vez." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("ElevenLabs", upstream.status, detail.slice(0, 500));
    return Response.json(
      { error: explain(upstream.status, detail) },
      { status: 502 },
    );
  }

  // Entero, no en streaming: son unos segundos de audio y así Safari
  // recibe un MP3 completo con su tamaño, que es lo que mejor digiere.
  const audio = await upstream.arrayBuffer().catch(() => null);
  if (!audio || audio.byteLength === 0) {
    return Response.json(
      { error: "ElevenLabs ha devuelto un audio vacío." },
      { status: 502 },
    );
  }

  return new Response(audio, {
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(audio.byteLength),
      "cache-control": "no-store",
    },
  });
}

/** El cuerpo de la petición según el modelo. */
function requestBody(model: string, text: string) {
  if (modelSupportsTags(model)) {
    // v3 y v4 solo aceptan tres estabilidades: 0 (creativa), 0.5
    // (natural) y 1 (robusta). La creativa a veces se inventa cosas;
    // la natural ya deja que las etiquetas se noten.
    return {
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    };
  }
  return {
    // Sin soporte de etiquetas las leería en alto: fuera.
    text: stripVoiceTags(text),
    model_id: model,
    // Las v2.5 aceptan el idioma explícito; sin él, una frase corta
    // con un anglicismo puede salir con acento inglés.
    ...(model.includes("v2_5") ? { language_code: "es" } : {}),
    // Poca estabilidad = más teatro. Lilita es dramática.
    voice_settings: {
      stability: 0.35,
      similarity_boost: 0.8,
      style: 0.45,
      use_speaker_boost: true,
    },
  };
}

/** Lo que no se lee en voz alta: markdown, emojis y espacios de más. */
function clean(raw: string): string {
  return raw
    .replace(/[*_`#>~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}
