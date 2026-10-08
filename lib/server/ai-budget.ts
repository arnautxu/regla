import "server-only";
import { adminDb } from "./supabase";
import { privateJson } from "./http";

const messages: Record<string, string> = {
  paused: "Lilita está descansando. Tu diario sigue disponible.",
  global_budget: "Las conversaciones están en pausa temporalmente. Tu diario sigue disponible.",
  voice_plan: "Las llamadas están incluidas en Plus con voz.",
  duplicate: "Esta petición ya se ha recibido.",
  rate: "Dame unos segundos antes de seguir.", busy: "Termina la conversación actual antes de empezar otra.",
  messages: "Has usado las respuestas incluidas. Puedes consultar tu plan en Ajustes.",
  minutes: "Has usado los minutos incluidos. Puedes seguir por escrito.",
  budget: "Has alcanzado el uso incluido de este periodo. Tu diario sigue disponible.",
};

export async function reserve(userId: string, kind: "chat" | "voice") {
  const id = crypto.randomUUID();
  const { data, error } = await adminDb().rpc("reserve_ai", { p_user: userId, p_id: id, p_kind: kind });
  if (error) return { response: privateJson({ error: "No puedo comprobar tu saldo. Prueba más tarde." }, 503) };
  if (data.error) return { response: privateJson({ error: messages[data.error] ?? "No se puede iniciar la conversación.", code: data.error }, 429) };
  return { id, seconds: data.seconds as number };
}

export async function settle(id: string, cost: number, seconds?: number, providerId?: string) {
  const { error } = await adminDb().rpc("settle_ai", { p_id: id, p_cost: Math.ceil(cost), p_seconds: seconds ?? null, p_provider: providerId ?? null });
  // On failure the full reservation stays charged. Never release blindly.
  if (error) {
    console.error("AI usage reconciliation failed", { reservation: id, code: error.code });
    throw new Error("Usage reconciliation failed");
  }
}
