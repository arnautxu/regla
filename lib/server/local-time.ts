/* La hora donde vive ella, no donde corre el servidor (UTC). La
   usan los crons y la vista de Arnau: "hoy" tiene que ser el mismo
   día en los tres sitios. */

const TZ = process.env.LILAILA_TZ || "Europe/Madrid";

/** Fecha y hora en el sitio donde vive ella, no donde corre esto. */
export function localNow(now: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      // h23 y no hour12:false: con hour12:false, medianoche sale como
      // "24" en algunas versiones de ICU y la comparación se va al
      // garete justo el día que el aviso cae de madrugada.
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}
