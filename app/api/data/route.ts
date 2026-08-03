import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";
import { readDoc, writeDoc, type StoredDoc } from "@/lib/server/store";

async function guard(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

const DENIED = Response.json({ error: "No autorizado." }, { status: 401 });

export async function GET() {
  if (!(await guard())) return DENIED;
  return Response.json(await readDoc());
}

/**
 * El móvil es la fuente de verdad y esto es su copia. Un solo
 * dispositivo, así que no hay fusión que hacer: se sobrescribe.
 *
 * Con una excepción que importa mucho. Si el cliente sube un
 * documento VACÍO y el servidor tiene datos, se rechaza. Ese caso no
 * es "borró todo": es Safari purgando IndexedDB, un móvil nuevo o un
 * fallo al arrancar. Sobrescribir ahí significa perder el historial
 * entero de forma silenciosa, y es justo el desastre que esta copia
 * existe para evitar.
 */
export async function PUT(req: Request) {
  if (!(await guard())) return DENIED;

  let incoming: StoredDoc;
  try {
    incoming = (await req.json()) as StoredDoc;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!Array.isArray(incoming.cycles) || !Array.isArray(incoming.days)) {
    return Response.json({ error: "Documento mal formado." }, { status: 400 });
  }

  const isEmpty = incoming.cycles.length === 0 && incoming.days.length === 0;
  if (isEmpty) {
    const existing = await readDoc();
    const serverHasData =
      existing.cycles.length > 0 || existing.days.length > 0;
    if (serverHasData) {
      return Response.json(
        {
          error:
            "Copia vacía rechazada: el servidor tiene datos. Restaura primero.",
          refused: true,
        },
        { status: 409 },
      );
    }
  }

  const doc: StoredDoc = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cycles: incoming.cycles,
    days: incoming.days,
    settings: incoming.settings ?? null,
  };

  await writeDoc(doc);
  return Response.json({ savedAt: doc.updatedAt });
}
