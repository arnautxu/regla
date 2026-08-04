"use client";

import { useEffect, useState } from "react";
import { updateSettings, type PillSettings } from "@/lib/db";
import { disable, enable, installed, status, type PushStatus } from "@/lib/push";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   AJUSTES DE LA PASTILLA

   Dos interruptores y no uno. Llevar la cuenta y que suene el móvil
   son decisiones distintas: se puede querer apuntarla sin que la app
   dé la brasa cada noche, y encender el aviso sin querer es
   exactamente el tipo de cosa que hace desinstalar una app.

   La hora no se puede elegir aquí, y no es un descuido: el aviso lo
   dispara un cron del servidor con hora fija (ver vercel.json).
   Poner un selector de horas que solo funcionara a las 22:00 sería
   mentir en la cara. Se cambia en el código, en dos sitios, y está
   documentado en .env.example.
   ═══════════════════════════════════════════════════════════════ */

const EXPLICA: Record<PushStatus, string> = {
  "sin-soporte":
    "Para que suene, añade Lilaila a la pantalla de inicio desde Compartir → Añadir a inicio. Desde el navegador, iOS no deja.",
  bloqueado:
    "Dijiste que no a las notificaciones. Eso se cambia en Ajustes del móvil → Lilaila, aquí no puedo.",
  "sin-servidor":
    "Este despliegue no tiene los avisos configurados. Faltan las claves en el servidor.",
  apagado: "",
  encendido: "",
};

export function PillPanel({ pill }: { pill: PillSettings }) {
  const [push, setPush] = useState<PushStatus | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void status().then(setPush);
  }, []);

  // El interruptor de avisos refleja el estado REAL del navegador, no
  // el ajuste guardado: si ella revoca el permiso desde iOS, el ajuste
  // sigue diciendo `true` y la app estaría prometiendo un aviso que no
  // va a llegar.
  const avisando = pill.remind && push === "encendido";
  const puedeAvisar = push === "apagado" || push === "encendido";

  async function alternarAviso() {
    if (ocupado) return;
    setOcupado(true);
    setAviso(null);
    try {
      if (avisando) {
        await disable();
        await updateSettings({ pill: { ...pill, remind: false } });
        setAviso("Vale, me callo.");
      } else {
        const res = await enable();
        setAviso(res.message);
        if (res.ok) await updateSettings({ pill: { ...pill, remind: true } });
      }
      setPush(await status());
    } finally {
      setOcupado(false);
    }
  }

  const hora = `${String(pill.hour).padStart(2, "0")}:00`;

  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
        La pastilla
      </h2>

      <div
        className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg"
        style={{ background: "var(--surface)" }}
      >
        <Interruptor
          label="Llevar la cuenta"
          hint="Aparece en Hoy y en cada día del calendario."
          on={pill.enabled}
          onToggle={() => {
            haptic(10);
            void (async () => {
              const enabled = !pill.enabled;
              // Apagar la cuenta apaga el aviso: seguir dando la brasa
              // por algo que ya no se apunta no tiene ningún sentido.
              if (!enabled && avisando) await disable();
              await updateSettings({
                pill: { ...pill, enabled, remind: enabled && pill.remind },
              });
              setPush(await status());
            })();
          }}
        />

        {pill.enabled && (
          <Interruptor
            label={`Avisarme a las ${hora}`}
            hint={
              puedeAvisar
                ? "Suena aunque tengas la app cerrada. Se marca desde el propio aviso."
                : "No disponible ahora mismo."
            }
            on={avisando}
            disabled={!puedeAvisar || ocupado}
            onToggle={() => {
              haptic(10);
              void alternarAviso();
            }}
          />
        )}
      </div>

      {pill.enabled && (push === null || EXPLICA[push] || aviso) && (
        <p className="mt-sm text-xs leading-relaxed text-faint" role="status">
          {aviso ?? (push ? EXPLICA[push] : "Comprobando…")}
        </p>
      )}

      {pill.enabled && push === "sin-soporte" && !installed() && (
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Mientras tanto, la pastilla se sigue apuntando igual: lo único que
          falta es que te lo recuerde.
        </p>
      )}
    </section>
  );
}

function Interruptor({
  label,
  hint,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-[56px] w-full items-center justify-between gap-md py-3 text-left transition-opacity duration-150 disabled:opacity-40"
    >
      <span>
        <span
          className="block text-base"
          style={{
            color: on ? "var(--accent)" : "var(--fg)",
            fontWeight: on ? 600 : 400,
          }}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
      </span>

      {/* Mismo lenguaje que el resto de Ajustes: un punto del acento.
          Un interruptor de iOS aquí sería el único control del sistema
          en toda la app. */}
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full transition-transform duration-150 ease-[var(--ease-out-quart)]"
        style={{
          background: on ? "var(--accent)" : "var(--border-strong)",
          transform: on ? "scale(1)" : "scale(0.6)",
        }}
      />
    </button>
  );
}
