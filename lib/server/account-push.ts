import { adminDb, userId } from "./supabase";
import type { PushDoc } from "./push";
export type VersionedPush = PushDoc & { revision?: number };
export async function readAccountPush(owner?: string): Promise<VersionedPush> {
  const { data, error } = await adminDb().from("push_accounts").select("document,revision").eq("user_id", owner ?? await userId()).maybeSingle();
  if (error) throw error;
  return { version: 1, subs: [], ...data?.document, revision: data?.revision ?? 0 };
}
export async function writeAccountPush(doc: VersionedPush, owner?: string) {
  const uid = owner ?? await userId();
  const { revision = 0, ...document } = doc;
  if (revision === 0) {
    const { error } = await adminDb().from("push_accounts").insert({ user_id: uid, document, revision: 1 });
    if (error) throw error;
  } else {
    const { data, error } = await adminDb().from("push_accounts").update({ document, revision: revision + 1 }).eq("user_id", uid).eq("revision", revision).select("revision");
    if (error || !data?.length) throw new Error("Los avisos han cambiado. Prueba de nuevo.");
  }
}
export async function runAccountsCron(run: (owner?: string) => Promise<Response>) {
  let cursor = "00000000-0000-0000-0000-000000000000";
  let processed = 0, failed = 0;
  for (;;) {
    const { data, error } = await adminDb().from("push_accounts").select("user_id").gt("user_id", cursor).order("user_id").limit(100);
    if (error) return Response.json({ error: "No se han podido leer los avisos." }, { status: 503 });
    if (!data?.length) break;
    for (const row of data) {
      try { const result = await run(row.user_id); if (!result.ok) failed++; } catch { failed++; }
      processed++;
    }
    cursor = data[data.length - 1].user_id;
  }
  return Response.json({ processed, failed }, { status: failed ? 503 : 200 });
}
