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

  /* Los ajustes se FUSIONAN, el resto se sobrescribe.
     ─────────────────────────────────────────────────
     Un cliente con la versión vieja en caché sube los ajustes que él
     conoce, y al reemplazarlos enteros se llevaba por delante los
     campos que no existían cuando se cargó su bundle. Pasó de verdad:
     borró la configuración del aviso de la pastilla y el cron se
     apagó solo, sin un error en ningún sitio.

     Fusionar arregla eso sin romper nada: apagar un ajuste sigue
     funcionando —eso viaja como `false`, no como ausencia—, y lo
     único que deja de poder hacerse es BORRAR una clave, que no es
     una operación que la app necesite.

     Los días y los ciclos no se fusionan a propósito: ahí sí hace
     falta poder borrar, y el móvil es la fuente de verdad. */
  const existing = await readDoc();
  const merged =
    incoming.settings && typeof incoming.settings === "object"
      ? {
          ...(existing.settings as Record<string, unknown> | null),
          ...(incoming.settings as Record<string, unknown>),
        }
      : (existing.settings ?? null);

  const doc: StoredDoc = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cycles: incoming.cycles,
    days: incoming.days,
    settings: merged,
    // Un cliente viejo no manda `memories` y no puede saber que
    // existen: si se guardara su ausencia como una lista vacía, abrir
    // la app en un móvil sin actualizar borraría del servidor todo lo
    // que Lilita recuerda. Mismo fallo que ya nos comió una vez la
    // configuración del aviso.
    memories: Array.isArray(incoming.memories)
      ? incoming.memories
      : (existing.memories ?? []),
  };

  await writeDoc(doc);
  return Response.json({ savedAt: doc.updatedAt });
}
