import { cookies } from "next/headers";
import { SESSION_COOKIE, requireSession } from "@/lib/server/auth";

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

// Voz por defecto: una de las de la biblioteca de ElevenLabs que habla
// español. Para la definitiva, elige o diseña una en elevenlabs.io y
// pon su id en ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

// Flash v2.5: la de menos latencia y multilingüe. Para más
// expresividad a costa de esperar un poco más: eleven_multilingual_v2.
const DEFAULT_MODEL = "eleven_flash_v2_5";

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

  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        // Las v2.5 aceptan el idioma explícito; sin él, una frase
        // corta con un anglicismo puede salir con acento inglés.
        ...(model.includes("v2_5") ? { language_code: "es" } : {}),
        // Poca estabilidad = más teatro. Lilita es dramática.
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.8,
          style: 0.45,
          use_speaker_boost: true,
        },
      }),
    },
  ).catch(() => null);

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

/**
 * Traduce el error de ElevenLabs a algo que Arnau pueda arreglar.
 * Callarse aquí es lo peor: el altavoz no suena y nadie sabe por qué.
 */
function explain(status: number, raw: string): string {
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
    return "La clave de ElevenLabs no tiene permiso de Text to Speech. Edítala en elevenlabs.io y actívalo.";
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
