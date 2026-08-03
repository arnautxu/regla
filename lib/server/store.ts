import { get, put } from "@vercel/blob";

/* ═══════════════════════════════════════════════════════════════
   ALMACÉN

   Un único documento JSON privado. Toda la vida de registro de Lídia
   son unos pocos kilobytes: trece ciclos y un par de cientos de días
   sueltos. Montar Postgres para esto sería ceremonia sin motivo.

   El blob es `access: "private"`, así que no hay URL pública que
   adivinar: solo se lee con el token del servidor.
   ═══════════════════════════════════════════════════════════════ */

const PATH = "lilaila/data.json";

export interface StoredDoc {
  version: 1;
  updatedAt: string;
  cycles: unknown[];
  days: unknown[];
  settings: unknown;
}

const EMPTY: StoredDoc = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  cycles: [],
  days: [],
  settings: null,
};

export async function readDoc(): Promise<StoredDoc> {
  try {
    const result = await get(PATH, { access: "private" });
    // get() ya trae el cuerpo: no hay que ir a buscar la URL aparte,
    // que además en un blob privado exigiría autenticar otra vez.
    if (!result || result.statusCode !== 200) return EMPTY;
    return (await new Response(result.stream).json()) as StoredDoc;
  } catch {
    // Primera ejecución: el blob todavía no existe.
    return EMPTY;
  }
}

export async function writeDoc(doc: StoredDoc): Promise<void> {
  await put(PATH, JSON.stringify(doc), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    // Sin caché: el documento se reescribe en cada sincronización y
    // servir una versión vieja significaría resucitar datos borrados.
    cacheControlMaxAge: 0,
    addRandomSuffix: false,
  });
}
