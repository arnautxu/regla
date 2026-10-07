/* Elegir el primer modelo que contesta, sin romper el streaming. */

/** Error propio para "no ha dicho nada a tiempo". */
export class SlowModelError extends Error {
  constructor(name: string, ms: number, midway = false) {
    super(
      midway
        ? `${name} se ha quedado a medias (timeout)`
        : `${name} no ha empezado a contestar en ${Math.round(ms / 1000)} s (timeout)`,
    );
    this.name = "SlowModelError";
  }
}

type Options = {
  /** Instante (Date.now()) en que hay que haber terminado sí o sí. */
  deadline: number;
  /** Lo que se espera a la primera palabra antes de pasar al siguiente. */
  firstWordMs: number;
};

/**
 * Prueba los modelos en orden y se queda con el primero que empieza a
 * contestar. Solo se salta al siguiente si el fallo llega ANTES de la
 * primera palabra y es de cuota, de saturación o de lentitud: con
 * media respuesta ya en la pantalla, cambiar de modelo la dejaría a
 * trozos.
 *
 * Todo cabe en `deadline`. Si un modelo se queda colgado sin decir
 * nada, se corta a los `firstWordMs` y se pasa al siguiente; el último
 * tiene lo que quede. Así Vercel nunca llega a matar la función
 * (FUNCTION_INVOCATION_TIMEOUT) y el móvil siempre recibe algo.
 */
export async function firstThatAnswers<Part extends { type: string }, C extends { name: string }>(
  chain: C[],
  start: (c: C, last: boolean, signal: AbortSignal) => ReadableStream<Part>,
  { deadline, firstWordMs }: Options,
): Promise<ReadableStream<Part>> {
  const earlier: unknown[] = [];
  for (let i = 0; ; i++) {
    const last = i === chain.length - 1;
    const left = deadline - Date.now();
    const wait = last ? left : Math.min(firstWordMs, left);
    const abort = new AbortController();
    const slow = new SlowModelError(chain[i].name, wait);
    let timer = setTimeout(() => abort.abort(slow), Math.max(0, wait));
    const reader = start(chain[i], last, abort.signal).getReader();
    const read = () => raceAbort(reader.read(), abort.signal);

    const seen: Part[] = [];
    let failure: unknown = null;
    for (;;) {
      let step: ReadableStreamReadResult<Part>;
      try {
        step = await read();
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
    clearTimeout(timer);
    if (abort.signal.aborted) failure = abort.signal.reason;

    if (failure && !last && retryable(failure)) {
      console.warn("chat: falla", chain[i].name, "→", chain[i + 1].name, String(failure));
      earlier.push(failure);
      abort.abort(failure);
      void reader.cancel().catch(() => {});
      continue;
    }

    // Si el último ni existe (404), lo útil es contar por qué fallaron
    // los de antes, no que el recambio no está.
    if (failure && last && notFound(failure)) {
      failure = earlier.find((e) => !notFound(e)) ?? failure;
      seen.length = 0;
    }

    // No hay más modelos: se suelta este para que no quede nada colgando.
    if (failure) void reader.cancel().catch(() => {});

    // Ya habla (o ya no hay a quién pasar). El resto de la respuesta
    // también tiene que caber antes del límite.
    if (!failure) {
      timer = setTimeout(
        () => abort.abort(new SlowModelError(chain[i].name, 0, true)),
        Math.max(0, deadline - Date.now()),
      );
    }
    return new ReadableStream<Part>({
      start(controller) {
        for (const part of seen) {
          // Un "abort" de nuestro propio corte no es la respuesta: lo
          // que cuenta es el error que va justo después.
          if (failure && part.type === "abort") continue;
          controller.enqueue(part);
        }
        // Como parte "error" y no controller.error: así toUIMessageStream
        // lo pasa por onError y el móvil recibe el porqué, no un corte.
        if (failure) {
          if (seen.at(-1)?.type !== "error") {
            controller.enqueue({ type: "error", error: failure } as unknown as Part);
          }
          controller.close();
        }
      },
      async pull(controller) {
        if (failure) return;
        try {
          const { done, value } = await read();
          if (done) {
            clearTimeout(timer);
            controller.close();
          } else controller.enqueue(value);
        } catch (e) {
          clearTimeout(timer);
          controller.enqueue({ type: "error", error: e } as unknown as Part);
          controller.close();
        }
      },
      cancel() {
        clearTimeout(timer);
        abort.abort();
        void reader.cancel().catch(() => {});
      },
    });
  }
}

/** Una lectura que no se queda esperando si la señal ya se ha cortado. */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** El error de verdad: el SDK envuelve los reintentos en un RetryError. */
export function rootError(error: unknown): { statusCode?: number; message: string } {
  const e = (error as { lastError?: unknown })?.lastError ?? error;
  const { statusCode, message } = (e ?? {}) as { statusCode?: number; message?: string };
  return { statusCode, message: String(message ?? e) };
}

/** Saturación de Google: "high demand", "overloaded", 503. */
export const OVERLOADED = /high demand|overloaded|unavailable|try again later/i;

function notFound(error: unknown): boolean {
  const { statusCode, message } = rootError(error);
  return statusCode === 404 || /not found|is not supported/i.test(message);
}

/** Fallos que otro modelo puede salvar: cuota, saturación, clave, lentitud. */
function retryable(error: unknown): boolean {
  if (error instanceof SlowModelError) return true;
  const { statusCode = 0, message } = rootError(error);
  return (
    [401, 403, 404, 408, 429, 500, 502, 503, 504].includes(statusCode) ||
    OVERLOADED.test(message) ||
    /quota|rate limit|resource.?exhausted|timeout|timed out/i.test(message)
  );
}
