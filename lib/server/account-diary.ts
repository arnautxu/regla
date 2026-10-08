import { z } from "zod";
import { adminDb, currentUser, userId } from "./supabase";
import { limitedJson, privateJson, sameOrigin } from "./http";
import type { StoredDoc } from "./store";

const docSchema = z.object({
  version: z.literal(1), revision: z.number().int().nonnegative(),
  cycles: z.array(z.object({ id: z.string().min(1).max(100), startDate: z.iso.date() }).passthrough()).max(1000),
  days: z.array(z.object({ date: z.iso.date() }).passthrough()).max(20000),
  settings: z.record(z.string(), z.unknown()).nullable(),
  memories: z.array(z.object({ id: z.string().min(1).max(100), text: z.string().max(500), createdAt: z.string() }).passthrough()).max(1000).optional(),
});

export async function readAccountDiary(owner?: string): Promise<StoredDoc & { revision: number }> {
  const { data, error } = await adminDb().rpc("read_diary", { p_user: owner ?? await userId() });
  if (error) throw error;
  return data;
}

export async function accountDataGet() {
  if (!(await currentUser())) return privateJson({ error: "Entra en tu cuenta." }, 401);
  try { return privateJson(await readAccountDiary()); }
  catch { return privateJson({ error: "No se ha podido leer la copia." }, 503); }
}

export async function accountDataPut(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta." }, 401);
  if (req.headers.get("x-lilaila-owner") !== user.id) return privateJson({ error: "La cuenta ha cambiado. Recarga antes de guardar." }, 409);
  const parsed = docSchema.safeParse(await limitedJson(req, 4_000_000).catch(() => null));
  if (!parsed.success) return privateJson({ error: "La copia no tiene un formato válido." }, 400);
  const { data, error } = await adminDb().rpc("save_diary", { p_user: user.id, p_revision: parsed.data.revision, p_doc: parsed.data });
  if (error) return privateJson({ error: "Hay otra copia más reciente o la copia está vacía. Descarga la copia de seguridad antes de continuar." }, 409);
  return privateJson({ savedAt: new Date().toISOString(), revision: data });
}

export async function accountDataDelete(req: Request) {
  if (!sameOrigin(req)) return privateJson({ error: "Origen no permitido." }, 403);
  const user = await currentUser();
  if (!user) return privateJson({ error: "Entra en tu cuenta para borrar también la copia." }, 401);
  if (req.headers.get("x-lilaila-owner") !== user.id) return privateJson({ error: "La cuenta ha cambiado." }, 409);
  const { data, error } = await adminDb().rpc("erase_diary", { p_user: user.id });
  return error ? privateJson({ error: "No se ha podido borrar la copia. Conservamos los datos del móvil." }, 503) : privateJson({ revision: data });
}
