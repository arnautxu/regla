"use client";

import { useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { fromKey } from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";
import { Lilita } from "./lilita";
import type { Acierto, CicloActual, Hallazgo, Marca } from "@/lib/analisis";

const COLOR: Record<Marca["id"], string> = {
  regla: "var(--ph-menstrual)",
  fertil: "var(--ph-ovulacion)",
  dolor: "var(--fg)",
  sintoma: "var(--ph-lutea)",
  pas: "var(--accent)",
  monstruo: "var(--cookie)",
};

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{children}</p>
  );
}

/* ── Tu mes tipo: un ciclo cualquiera, con lo que pasa en cada tramo ── */

export function MesTipo({
  length,
  marcas,
  hoy,
}: {
  length: number;
  marcas: Marca[];
  hoy?: number;
}) {
  const pos = (d: number) => `${((d - 1) / length) * 100}%`;
  const ancho = (m: Marca) => `${((m.to - m.from + 1) / length) * 100}%`;
  return (
    <section className="sticker rounded-[20px] px-md py-md" style={{ background: "var(--surface)" }}>
      <Titulo>Tu mes tipo</Titulo>
      <h2 className="mt-1 font-display text-lg font-bold leading-tight tracking-[-0.015em]">
        Así va un ciclo tuyo de {length} días
      </h2>

      <div className="relative mt-md">
        {/* Regla de días */}
        <div className="relative h-4 text-[10px] text-faint">
          {[1, 7, 14, 21, length].map((d) => (
            <span
              key={d}
              className="tnum absolute -translate-x-1/2"
              style={{ left: `calc(${pos(d)} + ${50 / length}%)` }}
            >
              {d}
            </span>
          ))}
        </div>
        <div className="relative mt-1 flex flex-col gap-1.5">
          {marcas.map((m, i) => (
            <div key={i} className="relative h-[22px] rounded-md" style={{ background: "var(--bg)" }}>
              <div
                className="absolute inset-y-0 rounded-md"
                style={{
                  left: pos(m.from),
                  width: ancho(m),
                  minWidth: 8,
                  background: COLOR[m.id],
                  opacity: m.id === "fertil" ? 0.75 : 1,
                }}
              />
            </div>
          ))}
          {hoy !== undefined && hoy <= length && (
            <div
              className="pointer-events-none absolute -inset-y-1 w-0"
              style={{ left: `calc(${pos(hoy)} + ${50 / length}%)` }}
            >
              <div className="h-full border-l-2 border-dashed" style={{ borderColor: "var(--fg)" }} />
              <span
                className="absolute -bottom-5 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[10px] font-bold"
                style={{ background: "var(--fg)", color: "var(--bg)" }}
              >
                hoy
              </span>
            </div>
          )}
        </div>
      </div>

      <ul className="mt-lg flex flex-col gap-2">
        {marcas.map((m, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <span
              aria-hidden="true"
              className="mt-[5px] size-2.5 shrink-0 rounded-full"
              style={{ background: COLOR[m.id] }}
            />
            <span>
              <b className="font-semibold">{m.titulo}</b>
              <span className="text-muted">
                {" "}
                · {m.from === m.to ? `día ${m.from}` : `días ${m.from}–${m.to}`}. {m.detalle}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Este ciclo, contra los tuyos ───────────────────────────────── */

const TONO = {
  igual: { bg: "var(--bg)", fg: "var(--fg-muted)", txt: "como siempre" },
  mejor: { bg: "var(--ok-bg)", fg: "var(--ok)", txt: "mejor" },
  peor: { bg: "var(--accent-soft)", fg: "var(--accent)", txt: "peor" },
} as const;

export function EsteCiclo({ c, hoy }: { c: CicloActual; hoy: Date }) {
  return (
    <section className="sticker rounded-[20px] px-md py-md" style={{ background: "var(--surface)" }}>
      <Titulo>
        Este ciclo · día {c.dia} de {c.length}
      </Titulo>
      <h2 className="mt-1 font-display text-lg font-bold leading-tight tracking-[-0.015em]">
        {c.frase}
      </h2>
      <p className="mt-1 text-sm text-muted">
        La próxima, hacia el {format(c.proxima, "d 'de' MMMM", { locale: es })}
        {c.spread > 0 ? ` (±${c.spread})` : ""}. Lo que viene:
      </p>
      {c.viene.length > 0 && (
        <ul className="mt-md flex flex-col gap-1.5 rounded-2xl px-sm py-sm" style={{ background: "var(--bg)" }}>
          {c.viene.map((v, i) => {
            const en = differenceInCalendarDays(v.fecha, hoy);
            return (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="tnum w-[84px] shrink-0 whitespace-nowrap font-bold">
                  {en <= 0 ? "hoy" : en === 1 ? "mañana" : `en ${en} días`}
                </span>
                <span className="text-muted">{v.texto}</span>
              </li>
            );
          })}
        </ul>
      )}
      <table className="tnum mt-md w-full border-collapse text-left text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-[0.1em] text-faint">
            <th className="pb-1 font-semibold" />
            <th className="pb-1 font-semibold">Ahora</th>
            <th className="pb-1 font-semibold">Lo tuyo</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody>
          {c.filas.map((f) => (
            <tr key={f.label} className="border-t border-line">
              <td className="py-2 pr-2">{f.label}</td>
              <td className="py-2 pr-2 font-bold">{f.ahora}</td>
              <td className="py-2 pr-2 text-muted">{f.normal}</td>
              <td className="py-2 text-right">
                <span
                  className="rounded-full px-2 py-0.5 text-2xs font-bold"
                  style={{ background: TONO[f.tono].bg, color: TONO[f.tono].fg }}
                >
                  {TONO[f.tono].txt}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-2xs text-faint">Comparado con tus últimos ciclos hasta el mismo día.</p>
    </section>
  );
}

/* ── ¿Acierto? ──────────────────────────────────────────────────── */

export function Aciertos({
  lista,
  dentro,
  margen,
}: {
  lista: Acierto[];
  dentro: number;
  margen: number;
}) {
  const MAX = 6;
  const x = (e: number) => `${50 + (Math.max(-MAX, Math.min(MAX, e)) / MAX) * 46}%`;
  return (
    <section className="sticker rounded-[20px] px-md py-md" style={{ background: "var(--surface)" }}>
      <Titulo>¿Acierto?</Titulo>
      <h2 className="mt-1 font-display text-lg font-bold leading-tight tracking-[-0.015em]">
        {dentro} de {lista.filter((a) => !a.raro).length} veces he clavado la fecha (±{margen} días)
      </h2>
      <div className="mt-md flex flex-col gap-1.5">
        <div className="relative h-4 text-[10px] text-faint">
          <span className="absolute left-[4%]">antes</span>
          <span className="absolute left-1/2 -translate-x-1/2">el día</span>
          <span className="absolute right-[4%]">después</span>
        </div>
        {lista.map((a) => {
          const raro = a.raro;
          return (
            <div key={a.startKey} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-2xs text-muted">
                {format(fromKey(a.startKey), "MMM", { locale: es })}
              </span>
              <div className="relative h-[22px] flex-1 rounded-md" style={{ background: "var(--bg)" }}>
                <div
                  className="absolute inset-y-0 rounded-md"
                  style={{
                    left: x(-margen),
                    right: `calc(100% - ${x(margen)})`,
                    background: "var(--ok-bg)",
                  }}
                />
                <div className="absolute inset-y-1 left-1/2 w-px" style={{ background: "var(--border-strong)" }} />
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: x(a.error),
                    background: Math.abs(a.error) <= margen ? "var(--ok)" : raro ? "var(--fg-faint)" : "var(--accent)",
                  }}
                />
              </div>
              <span className="tnum w-[74px] shrink-0 text-right text-2xs text-muted">
                {a.error === 0
                  ? "clavado"
                  : `${Math.abs(a.error)} ${Math.abs(a.error) === 1 ? "día" : "días"} ${a.error > 0 ? "tarde" : "antes"}`}
              </span>
            </div>
          );
        })}
      </div>
      {lista.some((a) => a.raro) && (
        <p className="mt-2 text-2xs text-faint">En gris, el mes que marcaste como raro: ese no cuenta.</p>
      )}
    </section>
  );
}

/* ── La conclusión, pero con todas las que hay ──────────────────── */

export function Conclusiones({ items }: { items: Hallazgo[] }) {
  const [i, setI] = useState(0);
  const [x0, setX0] = useState<number | null>(null);
  const h = items[Math.min(i, items.length - 1)];
  if (!h) return null;
  const ir = (n: number) => {
    if (n < 0 || n >= items.length) return;
    haptic(6);
    setI(n);
  };
  return (
    <article
      onPointerDown={(e) => setX0(e.clientX)}
      onPointerUp={(e) => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        setX0(null);
        if (Math.abs(dx) > 40) ir(dx < 0 ? i + 1 : i - 1);
      }}
      aria-live="polite"
      className="sticker rounded-[20px] px-md py-md"
      style={{ background: h.aviso ? "var(--accent-soft)" : "var(--surface)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <Titulo>{h.antetitulo}</Titulo>
        <span className="tnum text-2xs font-semibold text-faint">
          {i + 1} de {items.length}
        </span>
      </div>
      <h2 className="mt-1 font-display text-lg font-bold leading-tight tracking-[-0.015em]">{h.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{h.detail}</p>
      {h.basis > 0 && (
        <p className="mt-1 text-xs text-faint">
          Sobre {h.basis} {h.basis === 1 ? "registro" : "registros"}
        </p>
      )}
      <div className="mt-md flex items-center justify-between">
        <div className="flex gap-1.5">
          {items.map((it, j) => (
            <span
              key={it.id}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: j === i ? 18 : 6,
                background: j === i ? "var(--fg)" : "var(--border-strong)",
              }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Anterior"
            disabled={i === 0}
            onClick={() => ir(i - 1)}
            className="flex size-9 items-center justify-center rounded-full text-lg font-bold disabled:opacity-30"
            style={{ boxShadow: "inset 0 0 0 1.5px var(--border-strong)" }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            disabled={i === items.length - 1}
            onClick={() => ir(i + 1)}
            className="flex size-9 items-center justify-center rounded-full text-lg font-bold disabled:opacity-30"
            style={{ background: "var(--fg)", color: "var(--bg)" }}
          >
            ›
          </button>
        </div>
      </div>
    </article>
  );
}

/* ── Sin Plus: se ve que hay algo, pero no se lee ───────────────── */

export function AnalisisPlus({ fondo, onPlus }: { fondo: React.ReactNode; onPlus: () => void }) {
  return (
    <section className="relative">
      {/* Su propio mes tipo, borroso: se nota que está ahí y que es suyo. */}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] opacity-70">
        {fondo}
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-sm">
        <div
          className="sticker flex flex-col items-center gap-2 rounded-[20px] px-md py-md text-center"
          style={{ background: "var(--surface)" }}
        >
          <Lilita mood="flirty" size={64} />
          <h2 className="font-display text-lg font-bold leading-tight tracking-[-0.015em] text-balance">
            Lo que veo en tu regla es de Plus
          </h2>
          <ul className="flex flex-col gap-1 text-left text-sm text-muted">
            <li>· Lo que te viene este ciclo, día a día</li>
            <li>· Tu mes tipo, dibujado</li>
            <li>· Todos los patrones que encuentro</li>
            <li>· Cuánto acierto con las fechas</li>
          </ul>
          <button
            type="button"
            onClick={() => {
              haptic(8);
              onPlus();
            }}
            className="mt-1 rounded-full px-lg py-2.5 text-sm font-bold"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Ver Plus
          </button>
        </div>
      </div>
    </section>
  );
}
