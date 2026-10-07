"use client";

import { PHASE_LABEL, type Phase } from "@/lib/cycle";
import {
  HOUR_LABEL,
  formatMinutes,
  type EpisodeReport,
  type HourBucket,
} from "@/lib/episodes";

/* ═══════════════════════════════════════════════════════════════
   TUS PAS / COOKIE MONSTER

   Una tarjeta por tipo de episodio, leída como la regla: en qué días
   del ciclo se juntan (la tira), en qué fase (corregido por lo que
   dura cada una), a qué hora y, en los enfados, cuánto duran y qué
   respuesta de Arnau los arregla antes. Cada bloque aparece solo
   cuando hay datos suficientes para sostenerlo.
   ═══════════════════════════════════════════════════════════════ */

const PHASE_VAR: Record<Phase, string> = {
  menstrual: "var(--ph-menstrual)",
  folicular: "var(--ph-folicular)",
  ovulacion: "var(--ph-ovulacion)",
  lutea: "var(--ph-lutea)",
};

const HOURS: HourBucket[] = ["madrugada", "manana", "tarde", "noche"];

const REPLY_LABEL = { animos: "Ánimos", pulla: "Pulla", mensaje: "Mensaje" } as const;

export function EpisodeCard({ report }: { report: EpisodeReport }) {
  const pas = report.kind === "pas";
  const color = pas ? "var(--accent)" : "var(--cookie)";
  const [lead, ...more] = report.insights;
  const windowLead = lead?.id.endsWith("-ventana") ? lead : undefined;
  // La duración ya sale en cifras debajo; no se repite como frase.
  const others = (windowLead ? more : report.insights).filter(
    (i) => !(report.duration && i.id === "monstruo-duracion"),
  );

  return (
    <article
      className="flat flex flex-col gap-3 rounded-[20px] px-md py-md"
      style={{ background: pas ? "var(--surface)" : "var(--cookie-bg)" }}
    >
      <header>
        <p className="text-2xs font-semibold uppercase tracking-[0.14em]" style={{ color }}>
          {pas ? "💧 Tus PAS" : "🍪 Cookie Monster"}
        </p>
        <h3 className="mt-1 font-display text-base font-bold leading-tight tracking-[-0.015em]">
          {report.total === 0
            ? pas
              ? "Todavía no has apuntado ningún PAS"
              : "Todavía no hay enfados apuntados"
            : (windowLead?.title ??
              `${report.total} ${pas ? "PAS" : report.total === 1 ? "enfado" : "enfados"} en ${report.cycles} ${report.cycles === 1 ? "ciclo" : "ciclos"}`)}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {report.total === 0
            ? pas
              ? "Cuando toques «He llorado» en Hoy, aquí verás en qué días del ciclo se juntan."
              : "Cada vez que toques Cookie Monster quedará apuntado aquí, con lo que dura hasta «se me ha pasado»."
            : (windowLead?.detail ??
              "Con unos cuantos más, en al menos tres ciclos, te digo en qué días se juntan.")}
        </p>
      </header>

      {report.total > 0 && <Strip report={report} color={color} />}

      {report.phaseRates && (
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
            Por fase · cada 10 días
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {report.phaseRates.map((r) => {
              const max = Math.max(...report.phaseRates!.map((x) => x.per10), 0.01);
              return (
                <div key={r.phase} className="grid grid-cols-[72px_1fr_30px] items-center gap-2 text-xs">
                  <span>{PHASE_LABEL[r.phase]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(r.per10 / max) * 100}%`, background: PHASE_VAR[r.phase] }}
                    />
                  </span>
                  <span className="tnum text-right text-muted">{r.per10.toFixed(1).replace(".", ",")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.hours && (
        <div className="grid grid-cols-4 gap-1 text-center">
          {HOURS.map((h) => {
            const n = report.hours![h];
            const top = n === Math.max(...Object.values(report.hours!)) && n > 0;
            return (
              <div
                key={h}
                className="rounded-xl py-1.5"
                style={{ background: top ? (pas ? "var(--accent-soft)" : "var(--surface)") : "transparent" }}
              >
                <p className="tnum font-display text-base font-bold leading-none">{n}</p>
                <p className="mt-1 text-[11px] text-muted">{HOUR_LABEL[h]}</p>
              </div>
            );
          })}
        </div>
      )}

      {report.duration && (
        <dl className="grid grid-cols-2 gap-x-md gap-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <div>
            <dt className="text-2xs text-muted">Duración media</dt>
            <dd className="tnum font-display text-base font-bold">{formatMinutes(report.duration.avg)}</dd>
          </div>
          {report.duration.inWindow !== undefined && (
            <div>
              <dt className="text-2xs text-muted">En la zona monstruo</dt>
              <dd className="tnum font-display text-base font-bold">{formatMinutes(report.duration.inWindow)}</dd>
            </div>
          )}
          {report.replies?.map((r) => (
            <div key={r.kind}>
              <dt className="text-2xs text-muted">Con {REPLY_LABEL[r.kind].toLowerCase()} de Arnau</dt>
              <dd className="tnum font-display text-base font-bold">{formatMinutes(r.avg)}</dd>
            </div>
          ))}
        </dl>
      )}

      {others.length > 0 && (
        <ul className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {others.map((i) => (
            <li key={i.id}>
              <p className="font-display text-sm font-bold leading-snug">{i.title}</p>
              <p className="text-xs leading-relaxed text-muted">{i.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {report.total > 0 && (
        <p className="text-xs text-faint">
          Sobre {report.total} {report.total === 1 ? "registro" : "registros"}
        </p>
      )}
    </article>
  );
}

/** Una celda por día del ciclo; cuanto más oscura, más episodios. */
function Strip({ report, color }: { report: EpisodeReport; color: string }) {
  const max = Math.max(...report.byCycleDay, 1);
  const w = report.window;
  const len = report.byCycleDay.length;
  return (
    <div>
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${len}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Episodios por día del ciclo${w ? `; se juntan del día ${w.from} al ${w.to}` : ""}`}
      >
        {report.byCycleDay.map((n, i) => {
          const inside = w && i + 1 >= w.from && i + 1 <= w.to;
          return (
            <span
              key={i}
              className="h-6 rounded-[3px]"
              style={{
                background: n
                  ? `color-mix(in oklch, ${color} ${Math.round(22 + (n / max) * 78)}%, var(--bg))`
                  : "var(--border)",
                boxShadow: inside ? `0 -3px 0 0 ${color}` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="tnum mt-1 flex justify-between text-[10px] text-faint">
        <span>día 1</span>
        <span>{Math.round(len / 2)}</span>
        <span>{len}</span>
      </div>
    </div>
  );
}
