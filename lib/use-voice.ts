"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  /** Hay que llamarlo dentro de un toque, antes de la primera respuesta */
  unlock: () => void;
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
};

export function useVoice(): Voice {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  // Cada petición lleva un turno: si llega tarde una voz vieja (porque
  // ya se ha pedido otra o se ha parado), no pisa a la nueva.
  const turn = useRef(0);

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
      el.addEventListener("ended", () => setPlaying(null));
      el.addEventListener("error", () => setPlaying(null));
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
    audio.current?.pause();
    setPlaying(null);
  }, []);

  const speak = useCallback(
    async (id: string, text: string) => {
      const mine = ++turn.current;
      const el = ensure();
      el.pause();
      setPlaying(id);
      try {
        const res = await fetch("/api/voz", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (mine !== turn.current) return;
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob);
        el.src = url.current;
        await el.play();
      } catch {
        if (mine === turn.current) setPlaying(null);
      }
    },
    [ensure],
  );

  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  return { available, playing, talking, unlock, speak, stop };
}
