import { cookies } from "next/headers";
import { SESSION_COOKIE, requireSession } from "@/lib/server/auth";
import { explain, voiceId } from "@/lib/server/elevenlabs";
import { liveInstructions } from "@/lib/server/lilita-prompt";
import type { LilitaContext } from "@/lib/ai-context";

/* ═══════════════════════════════════════════════════════════════
   HABLAR CON LILITA EN DIRECTO (ElevenLabs Agents)

   El móvil pide aquí un pase de un solo uso y con él abre la llamada
   directamente contra ElevenLabs (WebRTC): la voz de Lídia va y
   vuelve sin pasar por este servidor, que es lo que la hace rápida.

   El agente no hace falta crearlo a mano. Si no hay
   ELEVENLABS_AGENT_ID, se busca uno llamado como AGENT_NAME en la
   cuenta y, si no existe, se crea con los permisos justos para que
   cada llamada le ponga el personaje y los datos del día.

   OJO, A DIFERENCIA DEL CHAT: en la llamada sí salen hacia
   ElevenLabs la voz de Lídia y sus datos (van en las instrucciones,
   porque allí es donde se piensa la respuesta). Por eso la llamada
   solo empieza cuando ella toca el botón.
   ═══════════════════════════════════════════════════════════════ */

export const maxDuration = 30;

const API = "https://api.elevenlabs.io/v1/convai";
const AGENT_NAME = "Lilaila · Lilita";

// v3 conversacional entiende las mismas acotaciones ([sighs],
// [laughs]…) que la voz del chat. Si la cuenta no lo admite, el
// agente se crea con Flash, que habla igual de rápido pero plano.
const MODELS = ["eleven_v3_conversational", "eleven_flash_v2_5"];

// Se recuerda entre llamadas mientras la función siga caliente.
let cachedAgent: string | null = null;

export async function GET() {
  return Response.json({ enabled: Boolean(process.env.ELEVENLABS_API_KEY) });
}

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json({ error: "Voz no configurada." }, { status: 503 });
  }

  const jar = await cookies();
  const denied = await requireSession(jar.get(SESSION_COOKIE)?.value);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { context?: LilitaContext } | null;
  if (!body?.context) {
    return Response.json({ error: "Faltan los datos del día." }, { status: 400 });
  }

  const agent = await agentId(key);
  if ("error" in agent) return Response.json(agent, { status: 502 });

  const res = await fetch(
    `${API}/conversation/token?agent_id=${encodeURIComponent(agent.id)}`,
    { headers: { "xi-api-key": key } },
  ).catch(() => null);
  if (!res) {
    return Response.json(
      { error: "No he podido llegar a ElevenLabs. Prueba otra vez." },
      { status: 502 },
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("ElevenLabs token", res.status, detail.slice(0, 500));
    // Un agente borrado a mano en ElevenLabs: la próxima vez se crea otro.
    if (res.status === 404) cachedAgent = null;
    return Response.json(
      { error: explain(res.status, detail, "ElevenLabs Agents") },
      { status: 502 },
    );
  }
  const { token } = (await res.json()) as { token: string };

  return Response.json({
    token,
    prompt: liveInstructions(body.context),
    voiceId: voiceId(),
  });
}

type Found = { id: string } | { error: string };

async function agentId(key: string): Promise<Found> {
  const fixed = process.env.ELEVENLABS_AGENT_ID;
  if (fixed) return { id: fixed };
  if (cachedAgent) return { id: cachedAgent };

  const list = await fetch(
    `${API}/agents?search=${encodeURIComponent(AGENT_NAME)}&page_size=10`,
    { headers: { "xi-api-key": key } },
  ).catch(() => null);
  if (list?.ok) {
    const { agents } = (await list.json()) as { agents?: { agent_id: string; name: string }[] };
    const mine = agents?.find((a) => a.name === AGENT_NAME);
    if (mine) return { id: (cachedAgent = mine.agent_id) };
  } else if (list) {
    const detail = await list.text().catch(() => "");
    console.error("ElevenLabs agents", list.status, detail.slice(0, 500));
    return { error: explain(list.status, detail, "ElevenLabs Agents") };
  }

  let last = { status: 0, detail: "" };
  for (const model of MODELS) {
    const res = await fetch(`${API}/agents/create`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify(agentConfig(model)),
    }).catch(() => null);
    if (!res) return { error: "No he podido llegar a ElevenLabs. Prueba otra vez." };
    if (res.ok) {
      const { agent_id } = (await res.json()) as { agent_id: string };
      return { id: (cachedAgent = agent_id) };
    }
    last = { status: res.status, detail: await res.text().catch(() => "") };
    console.error("ElevenLabs create agent", model, last.status, last.detail.slice(0, 500));
    if (![400, 404, 422].includes(res.status)) break;
  }
  return { error: explain(last.status, last.detail, "ElevenLabs Agents") };
}

/** El agente base. Lo que cambia en cada llamada llega como override. */
function agentConfig(model: string) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: "",
        language: "es",
        prompt: { prompt: "Eres Lilita, una gota de sangre con mucha personalidad." },
      },
      tts: { model_id: model, voice_id: voiceId() },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { prompt: { prompt: true }, first_message: true, language: true },
          tts: { voice_id: true },
        },
      },
    },
  };
}
