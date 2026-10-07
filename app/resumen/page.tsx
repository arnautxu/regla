"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db, fromKey, type DayLog } from "@/lib/db";
import { computeStats, summarizeCycles } from "@/lib/history";
import { computeInsights } from "@/lib/insights";
import { phaseByDay } from "@/lib/cycle";
import { SINTOMAS, labelOf } from "@/lib/labels";
import { useLilaila } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   RESUMEN PARA LA GINECÓLOGA

   Una hoja para enseñar en la consulta o guardar en PDF desde el
   botón de imprimir del móvil. Los últimos seis ciclos y lo que de
   verdad pregunta un médico: cuánto duran, cuánto dura la regla,
   cuánto duele y qué síntomas se repiten.

   Aquí Lilita se calla: esto lo lee otra persona, así que va en
   frases normales. Y se queda fuera lo que no es de la consulta: ni
   PAS, ni enfados, ni sexo, ni notas. Si ella quiere contarlo, ya lo
   contará con su boca.
   ═══════════════════════════════════════════════════════════════ */

const CICLOS = 6;

/* Las palabras de casa no son para la consulta. */
const PARA_MEDICA: Record<string, string> = {
  "tetas-doloridas": "Dolor de pecho",
  "dolor-lumbar": "Dolor lumbar",
  cagalera: "Diarrea",
};

function fecha(key: string) {
  return format(fromKey(key), "d MMM yyyy", { locale: es });
}

export default function Resumen() {
  const { ready, settings, cycles, dateKey } = useLilaila();
  const days = useLiveQuery(() => db.days.toArray(), [], [] as DayLog[]);

  const summaries = useMemo(
    () => summarizeCycles(cycles, days ?? [], dateKey),
    [cycles, days, dateKey],
  );
  const stats = useMemo(
    () => computeStats(cycles, summaries, settings),
    [cycles, summaries, settings],
  );
  const avisos = useMemo(
    () =>
      computeInsights(cycles, days ?? [], settings, dateKey, (d, len) =>
        phaseByDay(d, len, settings.avgPeriodLength),
      ).filter((i) => i.kind === "aviso"),
    [cycles, days, settings, dateKey],
  );

  const ultimos = summaries.slice(0, CICLOS);
  const desde = ultimos.at(-1)?.startKey;

  // Síntomas en el periodo que cubre la hoja, de más a menos.
  const sintomas = (() => {
    if (!desde) return [];
    const cuenta = new Map<string, number>();
    for (const d of days ?? []) {
      if (d.date < desde) continue;
      for (const s of d.symptoms ?? []) cuenta.set(s, (cuenta.get(s) ?? 0) + 1);
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s, n]) => ({ label: PARA_MEDICA[s] ?? labelOf(SINTOMAS, s as never) ?? s, n }));
  })();

  const dolorFuerte = (days ?? []).filter(
    (d) => desde && d.date >= desde && (d.painLevel ?? 0) >= 7,
  ).length;

  if (!ready) return null;

  return (
    <div className="resumen flex flex-1 flex-col gap-lg px-safe pt-safe pb-xl">
      <div className="flex items-center justify-between gap-md pt-lg print:hidden">
        <Link href="/historial" className="text-sm font-semibold" style={{ color: "var(--fg-muted)" }}>
          ‹ Historial
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full px-md py-2 text-sm font-bold"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Imprimir o guardar PDF
        </button>
      </div>

      <header>
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Resumen del ciclo menstrual
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em]">
          {settings.name}
        </h1>
        <p className="text-sm text-muted">
          {desde
            ? `Del ${fecha(desde)} al ${fecha(dateKey)} · ${ultimos.length} ${ultimos.length === 1 ? "ciclo" : "ciclos"}`
            : "Todavía no hay ciclos registrados."}
        </p>
      </header>

      {desde && (
        <>
          <section>
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">En resumen</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              <li>
                Duración del ciclo:{" "}
                <b>
                  {stats.avgCycle
                    ? `${stats.avgCycle} días de media${stats.shortest && stats.longest ? ` (entre ${stats.shortest} y ${stats.longest})` : ""}`
                    : "sin datos suficientes"}
                </b>
              </li>
              <li>
                Duración de la regla: <b>{stats.avgPeriod ? `${stats.avgPeriod} días de media` : "sin datos suficientes"}</b>
              </li>
              <li>
                Días con dolor de 7 o más sobre 10: <b>{dolorFuerte}</b>
              </li>
              {settings.excludedCycles.length > 0 && (
                <li className="text-muted">
                  Ciclos que ella ha marcado como atípicos y no cuentan en las medias:{" "}
                  {settings.excludedCycles.map(fecha).join(", ")}.
                </li>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Ciclo a ciclo</h2>
            <table className="tnum mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-[0.1em] text-faint">
                  <th className="py-1.5 pr-2 font-semibold">Inicio</th>
                  <th className="py-1.5 pr-2 font-semibold">Ciclo</th>
                  <th className="py-1.5 pr-2 font-semibold">Regla</th>
                  <th className="py-1.5 font-semibold">Dolor máx.</th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-b-0">
                    <td className="py-1.5 pr-2">{fecha(s.startKey)}</td>
                    <td className="py-1.5 pr-2">
                      {s.cycleLength ? `${s.cycleLength} d` : "en curso"}
                      {settings.excludedCycles.includes(s.startKey) && " *"}
                    </td>
                    <td className="py-1.5 pr-2">{s.periodLength ? `${s.periodLength} d` : "—"}</td>
                    <td className="py-1.5">{s.maxPain !== undefined ? `${s.maxPain}/10` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ultimos.some((s) => settings.excludedCycles.includes(s.startKey)) && (
              <p className="mt-1 text-2xs text-faint">* Marcado por ella como atípico.</p>
            )}
          </section>

          {sintomas.length > 0 && (
            <section>
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
                Síntomas más apuntados
              </h2>
              <p className="mt-2 text-sm">
                {sintomas.map((s) => `${s.label} (${s.n} ${s.n === 1 ? "día" : "días"})`).join(", ")}.
              </p>
            </section>
          )}

          {settings.pill.enabled && (
            <PillLine days={days ?? []} desde={desde} hasta={dateKey} />
          )}

          {avisos.length > 0 && (
            <section>
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
                Para comentar
              </h2>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {avisos.map((a) => (
                  <li key={a.id}>{a.title}.</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-auto text-2xs leading-relaxed text-faint">
        Generado con Lilaila el {fecha(dateKey)} a partir de lo que ella ha
        apuntado en su móvil. No es un informe médico.
      </p>
    </div>
  );
}

function PillLine({ days, desde, hasta }: { days: DayLog[]; desde: string; hasta: string }) {
  const marcadas = days.filter((d) => d.date >= desde && d.date <= hasta && d.pill !== undefined);
  if (!marcadas.length) return null;
  const saltadas = marcadas.filter((d) => d.pill === false).length;
  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Anticonceptiva</h2>
      <p className="mt-2 text-sm">
        {saltadas === 0
          ? `Tomada todos los días apuntados (${marcadas.length}).`
          : `Saltada ${saltadas} de ${marcadas.length} días apuntados.`}
      </p>
    </section>
  );
}
