"use client";

import { useMemo, useState } from "react";
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
import { Pdf, compartirPdf } from "@/lib/pdf";

/* ═══════════════════════════════════════════════════════════════
   RESUMEN PARA LA GINECÓLOGA

   Una hoja para enseñar en la consulta o mandar en PDF (lib/pdf.ts:
   en la app instalada del iPhone, imprimir no hace nada). Los últimos seis ciclos y lo que de
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

  const [generando, setGenerando] = useState(false);

  // Las mismas frases para la pantalla y para el PDF.
  const rango = desde
    ? `Del ${fecha(desde)} al ${fecha(dateKey)} · ${ultimos.length} ${ultimos.length === 1 ? "ciclo" : "ciclos"}`
    : "Todavía no hay ciclos registrados.";
  const enResumen: [string, string][] = [
    [
      "Duración del ciclo",
      stats.avgCycle
        ? `${stats.avgCycle} días de media${stats.shortest && stats.longest ? ` (entre ${stats.shortest} y ${stats.longest})` : ""}`
        : "sin datos suficientes",
    ],
    ["Duración de la regla", stats.avgPeriod ? `${stats.avgPeriod} días de media` : "sin datos suficientes"],
    ["Días con dolor de 7 o más sobre 10", String(dolorFuerte)],
  ];
  const atipicos = settings.excludedCycles.length
    ? `Ciclos que ella ha marcado como atípicos y no cuentan en las medias: ${settings.excludedCycles.map(fecha).join(", ")}.`
    : null;
  const filas = ultimos.map((s) => [
    fecha(s.startKey),
    `${s.cycleLength ? `${s.cycleLength} d` : "en curso"}${settings.excludedCycles.includes(s.startKey) ? " *" : ""}`,
    s.periodLength ? `${s.periodLength} d` : "—",
    s.maxPain !== undefined ? `${s.maxPain}/10` : "—",
  ]);
  const hayAtipicoEnTabla = ultimos.some((s) => settings.excludedCycles.includes(s.startKey));
  const sintomasTxt = `${sintomas.map((s) => `${s.label} (${s.n} ${s.n === 1 ? "día" : "días"})`).join(", ")}.`;
  const pastilla = settings.pill.enabled && desde ? pillLine(days ?? [], desde, dateKey) : null;
  const pie = `Generado con Lilaila el ${fecha(dateKey)} a partir de lo que ella ha apuntado en su móvil. No es un informe médico.`;

  async function exportar() {
    if (generando) return;
    setGenerando(true);
    try {
      const pdf = new Pdf();
      const titulo = (t: string) => pdf.texto(t.toUpperCase(), { size: 8, bold: true, gris: 0.45, despues: 4 });
      pdf.texto("RESUMEN DEL CICLO MENSTRUAL", { size: 8, bold: true, gris: 0.45, despues: 2 });
      pdf.texto(settings.name, { size: 22, bold: true, despues: 2 });
      pdf.texto(rango, { size: 10.5, gris: 0.35, despues: 18 });
      if (desde) {
        titulo("En resumen");
        for (const [k, v] of enResumen) pdf.parrafo([{ t: `${k}: ` }, { t: v, bold: true }], { despues: 2 });
        if (atipicos) pdf.texto(atipicos, { size: 10, gris: 0.35 });
        pdf.espacio(16);
        titulo("Ciclo a ciclo");
        pdf.tabla(["Inicio", "Ciclo", "Regla", "Dolor máx."], filas, [0.34, 0.24, 0.2, 0.22]);
        if (hayAtipicoEnTabla) pdf.texto("* Marcado por ella como atípico.", { size: 8.5, gris: 0.45 });
        if (sintomas.length) {
          pdf.espacio(16);
          titulo("Síntomas más apuntados");
          pdf.texto(sintomasTxt);
        }
        if (pastilla) {
          pdf.espacio(16);
          titulo("Anticonceptiva");
          pdf.texto(pastilla);
        }
        if (avisos.length) {
          pdf.espacio(16);
          titulo("Para comentar");
          for (const a of avisos) pdf.texto(`•  ${a.title}.`, { despues: 2 });
        }
      }
      pdf.espacio(28);
      pdf.texto(pie, { size: 8.5, gris: 0.45 });

      const nombre = `resumen-ciclo-${dateKey}.pdf`;
      await compartirPdf(pdf.bytes(`Resumen del ciclo · ${settings.name}`), nombre, "Resumen del ciclo");
    } finally {
      setGenerando(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="resumen flex flex-1 flex-col gap-lg px-safe pt-safe pb-xl">
      <div className="flex items-center justify-between gap-md pt-lg print:hidden">
        <Link href="/historial" className="text-sm font-semibold" style={{ color: "var(--fg-muted)" }}>
          ‹ Historial
        </Link>
        <button
          type="button"
          onClick={exportar}
          disabled={generando}
          className="rounded-full px-md py-2 text-sm font-bold disabled:opacity-60"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Compartir PDF
        </button>
      </div>

      <header>
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Resumen del ciclo menstrual
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.03em]">
          {settings.name}
        </h1>
        <p className="text-sm text-muted">{rango}</p>
      </header>

      {desde && (
        <>
          <section>
            <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">En resumen</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {enResumen.map(([k, v]) => (
                <li key={k}>
                  {k}: <b>{v}</b>
                </li>
              ))}
              {atipicos && <li className="text-muted">{atipicos}</li>}
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
                {filas.map((f, i) => (
                  <tr key={ultimos[i].id} className="border-b border-line last:border-b-0">
                    {f.map((c, j) => (
                      <td key={j} className={j < f.length - 1 ? "py-1.5 pr-2" : "py-1.5"}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {hayAtipicoEnTabla && (
              <p className="mt-1 text-2xs text-faint">* Marcado por ella como atípico.</p>
            )}
          </section>

          {sintomas.length > 0 && (
            <section>
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
                Síntomas más apuntados
              </h2>
              <p className="mt-2 text-sm">{sintomasTxt}</p>
            </section>
          )}

          {pastilla && (
            <section>
              <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">Anticonceptiva</h2>
              <p className="mt-2 text-sm">{pastilla}</p>
            </section>
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

      <p className="mt-auto text-2xs leading-relaxed text-faint">{pie}</p>
    </div>
  );
}

function pillLine(days: DayLog[], desde: string, hasta: string): string | null {
  const marcadas = days.filter((d) => d.date >= desde && d.date <= hasta && d.pill !== undefined);
  if (!marcadas.length) return null;
  const saltadas = marcadas.filter((d) => d.pill === false).length;
  return saltadas === 0
    ? `Tomada todos los días apuntados (${marcadas.length}).`
    : `Saltada ${saltadas} de ${marcadas.length} días apuntados.`;
}
