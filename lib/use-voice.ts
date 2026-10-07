"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripVoiceTags } from "./voice-tags";

/* ═══════════════════════════════════════════════════════════════
   LILITA EN VOZ ALTA

   Un solo <audio> para toda la conversación, creado en el primer
   toque de Lídia. Eso no es un detalle: iOS solo deja sonar audio que
   arranca DENTRO de un gesto, y la respuesta llega segundos después
   del toque de enviar. Desbloqueando el elemento en ese toque (con un
   silencio de un instante) y reutilizándolo después, la voz suena
   aunque llegue tarde.
   ═══════════════════════════════════════════════════════════════ */

/** Un WAV de silencio de unos milisegundos, para desbloquear el audio. */
function silence(): string {
  const samples = 400;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, t: string) =>
    [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export type Voice = {
  /** El servidor tiene ElevenLabs configurado */
  available: boolean;
  /** Id del mensaje que está sonando, si alguno */
  playing: string | null;
  /** El audio está sonando de verdad (no cargando): para mover la boca */
  talking: boolean;
  /** Por qué no ha sonado el último intento, para enseñarlo */
  error: { id: string; message: string } | null;
  /** Lo que ya se ha oído del mensaje en directo, para enseñar solo eso */
  shown: { id: string; text: string } | null;
  /** Hay que llamarlo dentro de un toque, antes de la primera respuesta */
  unlock: () => void;
  speak: (id: string, text: string) => Promise<void>;
  /** Este mensaje se va a decir en directo: su texto espera a la voz */
  begin: (id: string) => void;
  /** Añade un trozo a la voz en directo de un mensaje que aún se escribe */
  enqueue: (id: string, text: string) => void;
  /** Ya no llegarán más trozos de ese mensaje */
  finish: (id: string) => void;
  stop: () => void;
};

/** La voz en directo: trozos que se piden en cuanto llegan y suenan en orden. */
type Live = {
  id: string;
  turn: number;
  items: Promise<string>[];
  /** El texto visible (sin acotaciones) de cada trozo */
  texts: string[];
  next: number;
  running: boolean;
  done: boolean;
  /** Cuándo avanzó por última vez el texto al ritmo de la voz */
  stamp: number;
  /** El texto ya no espera a la voz: se ha atascado y se enseña entero */
  free: boolean;
};

/** Lo máximo que el texto espera a una voz que no avanza. */
const PATIENCE_MS = 5000;

/** Pide el audio de un texto y devuelve una URL lista para sonar. */
async function synth(text: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/voz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new Error("Sin conexión: no he podido pedir la voz.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      body?.error ??
        (res.status === 401
          ? "La sesión ha caducado. Vuelve a entrar con el PIN."
          : `La voz ha fallado (${res.status}).`),
    );
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("Ha llegado un audio vacío.");
  return URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "audio/mpeg" }));
}

/** Lo que se ha dicho de un trozo, hasta la última palabra entera. */
function heard(text: string, fraction: number): string {
  if (fraction >= 1) return text;
  const k = Math.floor(text.length * fraction);
  const end = text.indexOf(" ", k);
  // Se enseña la palabra que está sonando entera, no a trozos.
  return end === -1 ? text : text.slice(0, end);
}

/** Espera a que el audio acabe (o lo paren). */
function untilDone(el: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      for (const ev of ["ended", "pause", "error"]) el.removeEventListener(ev, done);
      resolve();
    };
    for (const ev of ["ended", "pause", "error"]) el.addEventListener(ev, done);
  });
}

export function useVoice(): Voice {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null);
  // El último audio descargado. Si iOS no deja sonarlo porque llegó
  // fuera del toque, el siguiente toque lo reproduce al instante, sin
  // volver a esperar a la red (y por tanto dentro del gesto).
  const ready = useRef<{ id: string; text: string; url: string } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  // Cada petición lleva un turno: si llega tarde una voz vieja (porque
  // ya se ha pedido otra o se ha parado), no pisa a la nueva.
  const turn = useRef(0);
  const live = useRef<Live | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/voz")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d: { enabled?: boolean }) => alive && setAvailable(!!d.enabled))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const ensure = useCallback(() => {
    if (!audio.current) {
      const el = new Audio();
      el.preload = "auto";
      // Entre trozos de la voz en directo el audio también "acaba":
      // ahí no se apaga el altavoz, lo apaga la cola al terminar.
      const end = () => !live.current?.running && setPlaying(null);
      el.addEventListener("ended", end);
      el.addEventListener("error", end);
      // El silencio de desbloqueo también "suena": solo cuenta la voz.
      el.addEventListener("playing", () => setTalking(el.src.startsWith("blob:")));
      for (const ev of ["pause", "ended", "error", "emptied"])
        el.addEventListener(ev, () => setTalking(false));
      audio.current = el;
    }
    return audio.current;
  }, []);

  const unlock = useCallback(() => {
    const el = ensure();
    if (el.dataset.unlocked) return;
    el.src = silence();
    el.play()
      .then(() => {
        el.dataset.unlocked = "1";
      })
      .catch(() => {});
  }, [ensure]);

  const stop = useCallback(() => {
    turn.current++;
    live.current = null;
    setShown(null);
    audio.current?.pause();
    setPlaying(null);
  }, []);

  const play = useCallback(async (el: HTMLAudioElement, id: string, src: string) => {
    if (el.src !== src) el.src = src;
    try {
      await el.play();
      setError(null);
    } catch (e) {
      setPlaying(null);
      const name = (e as { name?: string })?.name;
      setError({
        id,
        message:
          name === "NotAllowedError"
            ? "El móvil no la ha dejado hablar sola. Toca Escuchar otra vez."
            : name === "NotSupportedError"
              ? "Este navegador no sabe reproducir el audio de Lilita."
              : "No ha sonado. Toca Escuchar otra vez.",
      });
    }
  }, []);

  const speak = useCallback(
    async (id: string, text: string) => {
      const mine = ++turn.current;
      live.current = null;
      setShown(null);
      const el = ensure();
      el.pause();
      setError(null);
      setPlaying(id);

      // Ya descargado: suena sin esperar, todavía dentro del toque.
      const cached = ready.current;
      if (cached && cached.id === id && cached.text === text) {
        el.currentTime = 0;
        await play(el, id, cached.url);
        return;
      }

      let src: string;
      try {
        src = await synth(text);
      } catch (e) {
        if (mine !== turn.current) return;
        setPlaying(null);
        setError({ id, message: (e as Error).message });
        return;
      }
      if (mine !== turn.current) {
        URL.revokeObjectURL(src);
        return;
      }

      if (url.current) URL.revokeObjectURL(url.current);
      url.current = src;
      ready.current = { id, text, url: url.current };
      await play(el, id, url.current);
    },
    [ensure, play],
  );

  /* La voz en directo. Cada frase se pide en cuanto Lilita la acaba
     de escribir, mientras sigue con la siguiente, y suenan en orden:
     así empieza a hablar a la primera frase en vez de esperar a que
     termine todo el mensaje y a que se genere el audio entero. */
  /* El texto acompaña a la voz: de cada trozo se enseña la parte
     proporcional a lo que lleva sonado, palabra a palabra. */
  const drain = useCallback(
    async (q: Live) => {
      const el = ensure();
      q.running = true;
      const quit = () => {
        q.running = false;
        live.current = null;
        setPlaying(null);
        setShown(null);
      };
      while (q.next < q.items.length) {
        const i = q.next;
        let src: string;
        try {
          src = await q.items[q.next++];
        } catch (e) {
          if (q.turn !== turn.current) return;
          quit();
          setError({ id: q.id, message: (e as Error).message });
          return;
        }
        if (q.turn !== turn.current) {
          URL.revokeObjectURL(src);
          return;
        }
        const old = url.current;
        url.current = src;
        el.src = src;
        if (old) URL.revokeObjectURL(old);
        const ended = untilDone(el);
        const before = q.texts.slice(0, i).filter(Boolean).join(" ");
        const text = q.texts[i];
        const show = (fraction: number) => {
          const now = heard(text, fraction);
          const all = before && now ? `${before} ${now}` : before || now;
          if (q.free) return;
          setShown((s) => {
            if (s?.id === q.id && s.text === all) return s;
            q.stamp = Date.now();
            return { id: q.id, text: all };
          });
        };
        let frame = 0;
        const tick = () => {
          // Si el navegador no sabe la duración, se estima a ritmo de
          // habla (unos 14 caracteres por segundo).
          const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : text.length / 14;
          show(Math.min(1, el.currentTime / d));
          frame = requestAnimationFrame(tick);
        };
        try {
          await el.play();
          tick();
        } catch (e) {
          if (q.turn !== turn.current) return;
          quit();
          const name = (e as { name?: string })?.name;
          setError({
            id: q.id,
            message:
              name === "NotAllowedError"
                ? "El móvil no la ha dejado hablar sola. Toca Escuchar."
                : "No ha sonado. Toca Escuchar.",
          });
          return;
        }
        await ended;
        cancelAnimationFrame(frame);
        if (q.turn !== turn.current) return;
        show(1);
      }
      q.running = false;
      if (q.done && live.current === q) quit();
    },
    [ensure],
  );

  const open = useCallback((id: string): Live => {
    const q = live.current;
    if (q && q.id === id) return q;
    const mine = ++turn.current;
    audio.current?.pause();
    const fresh: Live = {
      id,
      turn: mine,
      items: [],
      texts: [],
      next: 0,
      running: false,
      done: false,
      stamp: Date.now(),
      free: false,
    };
    live.current = fresh;
    setError(null);
    setPlaying(id);
    setShown({ id, text: "" });
    return fresh;
  }, []);

  const begin = useCallback((id: string) => void open(id), [open]);

  const enqueue = useCallback(
    (id: string, text: string) => {
      const q = open(id);
      const item = synth(text);
      item.catch(() => {}); // se gestiona al llegarle el turno
      q.items.push(item);
      q.texts.push(stripVoiceTags(text));
      if (!q.running) void drain(q);
    },
    [drain, open],
  );

  const finish = useCallback((id: string) => {
    const q = live.current;
    if (!q || q.id !== id) return;
    q.done = true;
    if (!q.running) {
      live.current = null;
      setPlaying(null);
      setShown(null);
    }
  }, []);

  /* El texto nunca se queda esperando a una voz atascada: si en unos
     segundos no ha avanzado (ElevenLabs tarda, el móvil no deja sonar
     o el audio no arranca), se enseña entero y la voz sigue a su aire
     si llega. Mejor un texto sin sincronizar que una Lilita muda. */
  useEffect(() => {
    if (!shown) return;
    const timer = setInterval(() => {
      const q = live.current;
      if (!q || q.id !== shown.id || q.free) return;
      if (Date.now() - q.stamp > PATIENCE_MS) {
        q.free = true;
        setShown(null);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [shown]);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  return { available, playing, talking, error, shown, unlock, speak, begin, enqueue, finish, stop };
}
