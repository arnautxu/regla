import "server-only";

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(req.url).origin;
}

/** Enforced while reading, including chunked requests without Content-Length. */
export async function limitedJson(req: Request, maxBytes = 32_768): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new Error("Petición demasiado grande");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Falta el contenido");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error("Petición demasiado grande"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const privateJson = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
