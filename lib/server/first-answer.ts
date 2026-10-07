/* Elegir el primer modelo que contesta, sin romper el streaming. */

/**
 * Prueba los modelos en orden y se queda con el primero que empieza a
 * contestar. Solo se salta al siguiente si el fallo llega ANTES de la
 * primera palabra y es de cuota o de saturación: con media respuesta
 * ya en la pantalla, cambiar de modelo la dejaría a trozos.
 */
export async function firstThatAnswers<Part extends { type: string }, C extends { name: string }>(
  chain: C[],
  start: (c: C, last: boolean) => ReadableStream<Part>,
): Promise<ReadableStream<Part>> {
  for (let i = 0; ; i++) {
    const last = i === chain.length - 1;
    const reader = start(chain[i], last).getReader();
    const seen: Part[] = [];
    let failure: unknown = null;
    for (;;) {
      let step: ReadableStreamReadResult<Part>;
      try {
        step = await reader.read();
      } catch (e) {
        failure = e;
        break;
      }
      const { done, value } = step;
      if (done) break;
      seen.push(value);
      if (value.type === "error") {
        failure = (value as unknown as { error: unknown }).error;
        break;
      }
      if (value.type === "text-delta" || value.type === "tool-call") break;
    }
    if (failure && !last && retryable(failure)) {
      console.warn("chat: sin cuota en", chain[i].name, "→", chain[i + 1].name);
      void reader.cancel().catch(() => {});
      continue;
    }
    return new ReadableStream<Part>({
      start(controller) {
        for (const part of seen) controller.enqueue(part);
        if (failure && seen.at(-1)?.type !== "error") controller.error(failure);
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel() {
        void reader.cancel().catch(() => {});
      },
    });
  }
}

/** Fallos que otro modelo puede salvar: cuota, saturación, clave. */
function retryable(error: unknown): boolean {
  const e = error as { statusCode?: number; message?: string };
  const status = e?.statusCode ?? 0;
  return (
    [401, 403, 404, 429, 500, 503].includes(status) ||
    /quota|rate limit|resource.?exhausted|overloaded|unavailable/i.test(String(e?.message ?? error))
  );
}

