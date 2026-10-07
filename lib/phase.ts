/* La fase a partir solo del día del ciclo y su longitud.

   Vive aparte, sin tocar la base de datos, porque también la usa el
   servidor (el aviso del ciclo y la vista de Arnau) y allí no hay
   IndexedDB que importar. */

export type Phase = "menstrual" | "folicular" | "ovulacion" | "lutea";

/**
 * Fase a partir solo del día y la longitud del ciclo. La versión sin
 * contexto, para análisis sobre registros sueltos.
 */
export function phaseByDay(
  day: number,
  length: number,
  periodLength = 5,
): Phase {
  if (day <= periodLength) return "menstrual";
  const ovulation = length - 14;
  if (day >= ovulation - 4 && day <= ovulation + 1) return "ovulacion";
  if (day < ovulation) return "folicular";
  return "lutea";
}
