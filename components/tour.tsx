"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Lilita } from "./lilita";
import type { Mood } from "@/lib/lilita/lines";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic } from "@/lib/use-lilaila";
import { cerrarTour } from "@/lib/tour";

/* ═══════════════════════════════════════════════════════════════
   TOUR

   Tres tarjetas a pantalla completa entre el onboarding y la primera
   vez en Hoy: el anillo, cómo se apunta y qué saca Lilita de todo
   eso. Se pasa con el botón o deslizando, y se puede saltar entero.
   ═══════════════════════════════════════════════════════════════ */

/* Los mismos colores que el anillo de Hoy, sin depender de la fase
   en la que esté ella: aquí se explica el mes entero. */
const FASE = {
  regla: "oklch(51% 0.2 26)",
  despues: "oklch(85% 0.04 60)",
  fertil: "oklch(48% 0.11 172)",
  ovulacion: "oklch(50% 0.18 350)",
  antes: "oklch(80% 0.06 350)",
};

const VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
};

export function Tour({ pareja }: { pareja: string | null }) {
  const [[i, dir], setPaso] = useState<[number, number]>([0, 1]);

  const tarjetas: { mood: Mood; titulo: string; texto: string; dibujo: React.ReactNode }[] = [
    {
      mood: "energica",
      titulo: "El anillo es tu mes",
      texto:
        "Cada cuadradito es un día. Rojo, la regla; verde, los fértiles; la bolita, hoy. Toca cualquiera y te cuento ese día.",
      dibujo: <Anillo />,
    },
    {
      mood: "flirty",
      titulo: "Un botón y me lo cuentas",
      texto: pareja
        ? `«Apuntar hoy» te hace una pregunta cada vez. Y si lloras o ${pareja} la lía, un toque y listo.`
        : "«Apuntar hoy» te hace una pregunta cada vez. Y si lloras, un toque y listo.",
      dibujo: <Botones pareja={pareja} />,
    },
    {
      mood: "gremlin",
      titulo: "Yo saco las conclusiones",
      texto:
        "Con dos o tres reglas ya te digo qué día duele más y cuándo te toca la semana sensible. Lo ves en Historial.",
      dibujo: <Grafica />,
    },
  ];
  const ultima = i === tarjetas.length - 1;
  const t = tarjetas[i];

  function ir(delta: number) {
    const next = i + delta;
    if (next < 0) return;
    if (next >= tarjetas.length) {
      haptic([18, 40, 26]);
      cerrarTour();
      return;
    }
    haptic(8);
    setPaso([next, delta]);
  }

  return (
    <div className="flex min-h-dvh flex-col px-safe pt-safe pb-xl">
      <div className="flex items-center justify-between pt-lg">
        <div className="flex gap-1.5" aria-hidden="true">
          {tarjetas.map((_, j) => (
            <span
              key={j}
              className="h-1.5 rounded-full transition-all duration-200"
              style={{
                width: j === i ? 22 : 8,
                background: j === i ? "var(--accent)" : "var(--border-strong)",
              }}
            />
          ))}
        </div>
        {!ultima && (
          <button
            type="button"
            onClick={() => {
              haptic(6);
              cerrarTour();
            }}
            className="min-h-[44px] px-1 text-sm font-semibold text-muted"
          >
            Saltar
          </button>
        )}
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section
            key={i}
            custom={dir}
            variants={VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) ir(1);
              else if (info.offset.x > 60) ir(-1);
            }}
            aria-label={`${i + 1} de ${tarjetas.length}`}
            className="flex flex-1 touch-pan-y flex-col items-center justify-center gap-lg [@media(max-height:700px)]:gap-md"
          >
            {/* En un iPhone SE no cabe todo: el dibujo encoge y Lilita
                se aparta, que ya sale en cada pantalla de la app. */}
            <div className="flex h-[230px] items-center justify-center [@media(max-height:700px)]:h-[180px] [@media(max-height:700px)]:scale-[0.78]">{t.dibujo}</div>
            <div className="[@media(max-height:700px)]:hidden">
              <Lilita mood={t.mood} size={84} />
            </div>
            <h1 className="text-center font-display text-[28px] font-bold leading-tight tracking-[-0.03em]">
              {t.titulo}
            </h1>
            <p className="max-w-[30ch] text-center text-base leading-relaxed text-muted">{t.texto}</p>
          </motion.section>
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => ir(1)}
        className="sticker rounded-full py-4 font-display text-lg font-bold"
        style={{ background: "var(--accent)", color: "var(--on-accent)" }}
      >
        {ultima ? "A por ello" : "Siguiente"}
      </button>
    </div>
  );
}

function Anillo() {
  const DIAS = 28;
  const color = (d: number) =>
    d < 5 ? FASE.regla : d < 10 ? FASE.despues : d < 15 ? FASE.fertil : d === 15 ? FASE.ovulacion : FASE.antes;
  const ang = (d: number) => (d / DIAS) * 2 * Math.PI - Math.PI / 2;
  const p = (r: number, a: number) => `${r * Math.cos(a)},${r * Math.sin(a)}`;
  const hoy = ang(12.5);
  return (
    <svg viewBox="-110 -110 220 220" width={230} height={230} aria-hidden="true">
      {Array.from({ length: DIAS }, (_, d) => {
        const a0 = ang(d) + 0.02;
        const a1 = ang(d + 1) - 0.02;
        return (
          <path
            key={d}
            d={`M${p(100, a0)}A100,100 0 0 1 ${p(100, a1)}L${p(78, a1)}A78,78 0 0 0 ${p(78, a0)}Z`}
            fill={color(d)}
          />
        );
      })}
      <circle cx={89 * Math.cos(hoy)} cy={89 * Math.sin(hoy)} r={14} fill="var(--surface)" stroke="var(--fg)" strokeWidth={3} />
    </svg>
  );
}

function Botones({ pareja }: { pareja: string | null }) {
  return (
    <div className="flex w-[230px] flex-col gap-sm" aria-hidden="true">
      <div className="flex gap-sm">
        <div className="sticker-sm flex flex-1 flex-col items-center rounded-2xl py-sm text-sm font-semibold" style={{ background: "var(--surface)" }}>
          <span className="text-xl">💧</span>
          He llorado
        </div>
        {pareja && (
          <div
            className="sticker-sm flex flex-1 flex-col items-center rounded-2xl py-sm text-sm font-semibold"
            style={{ background: "var(--surface)", color: "oklch(50% 0.12 240)" }}
          >
            <span className="text-xl">🍪</span>
            Cookie
          </div>
        )}
      </div>
      <div className="rounded-full py-3 text-center font-display text-base font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
        Apuntar hoy
      </div>
    </div>
  );
}

function Grafica() {
  const dolor = [6, 8, 5, 3, 1, 0.5, 0.3];
  return (
    <div className="sticker w-[230px] rounded-[20px] px-md py-md" style={{ background: "var(--surface)" }} aria-hidden="true">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Tu peor día</p>
      <p className="font-display text-lg font-bold">El día 2 de la regla</p>
      <div className="mt-2 flex h-16 items-end gap-1">
        {dolor.map((v, j) => (
          <span key={j} className="flex-1 rounded-t" style={{ height: `${v * 12}%`, background: j === 1 ? FASE.regla : "var(--border-strong)" }} />
        ))}
      </div>
    </div>
  );
}
