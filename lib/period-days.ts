import { addDays, differenceInCalendarDays } from "date-fns";
import { fromKey, toKey, type Cycle, type DayLog } from "./db";

/* ═══════════════════════════════════════════════════════════════
   EL DÍA ES LA VERDAD

   Antes había dos representaciones del mismo hecho: el flujo por día
   y un registro de ciclo con inicio y fin. Podían contradecirse —
   marcar "Nada" dentro de la regla, o "Mucho" fuera— y ganaba
   siempre el par inicio/fin, que es el que menos sabe.

   Ahora el dato es "este día sangré y cuánto". El ciclo se DERIVA:
   es una racha de días con flujo. Con eso salen gratis dos cosas que
   el modelo anterior no podía representar:

     · Reglas con un día de pausa en medio, que existen.
     · No tener que declarar el final. La regla acaba donde acaban
       los días marcados, sin ceremonia.
   ═══════════════════════════════════════════════════════════════ */

/** Hueco maximo dentro de una misma regla. Un dia sin manchar en
    mitad del periodo no lo parte en dos. */
const MAX_GAP = 1;

/** Separacion minima entre dos reglas distintas. */
const MIN_SEPARATION = 10;

export function bled(day: DayLog | undefined): boolean {
  return day !== undefined && day.flow !== undefined && day.flow > 0;
}

/**
 * Convierte los registros diarios en ciclos.
 *
 * Devuelve el mismo tipo que usaba el resto de la app, asi que
 * prediccion, calendario, historial y patrones siguen funcionando
 * sin enterarse de que ahora esto se calcula.
 */
export function derivedCycles(days: DayLog[], today: string): Cycle[] {
  const marcados = days
    .filter(bled)
    .map((d) => d.date)
    .sort();
  if (!marcados.length) return [];

  const rachas: string[][] = [];
  let actual: string[] = [marcados[0]];

  for (let i = 1; i < marcados.length; i++) {
    const hueco = differenceInCalendarDays(
      fromKey(marcados[i]),
      fromKey(marcados[i - 1]),
    );
    // Hueco pequenyo: sigue siendo la misma regla.
    if (hueco <= MAX_GAP + 1) actual.push(marcados[i]);
    else {
      rachas.push(actual);
      actual = [marcados[i]];
    }
  }
  rachas.push(actual);

  // Rachas demasiado juntas son la misma regla partida por un registro
  // que falta, no dos reglas en diez dias.
  const fusionadas: string[][] = [];
  for (const r of rachas) {
    const previa = fusionadas.at(-1);
    if (
      previa &&
      differenceInCalendarDays(fromKey(r[0]), fromKey(previa.at(-1)!)) <
        MIN_SEPARATION
    ) {
      previa.push(...r);
    } else fusionadas.push(r);
  }

  const porFecha = new Map(days.map((d) => [d.date, d]));

  return fusionadas.map((r) => {
    const inicio = r[0];
    const fin = r.at(-1)!;

    // Sigue abierta si el ultimo dia marcado es hoy o ayer: aun puede
    // continuar. Mas atras, la regla ya termino aunque nadie lo dijera.
    //
    // Pero si el dia siguiente esta marcado EXPLICITAMENTE sin
    // sangrado (flujo 0), la racha se cierra ahi: eso no es falta de
    // datos, es un dato que dice que no.
    const siguiente = porFecha.get(toKey(addDays(fromKey(fin), 1)));
    const cerradaAMano = siguiente?.flow === 0;
    const abierta =
      !cerradaAMano &&
      differenceInCalendarDays(fromKey(today), fromKey(fin)) <= 1;
    return {
      id: `d-${inicio}`,
      startDate: inicio,
      endDate: abierta ? undefined : fin,
    };
  });
}

/**
 * "Me bajó el día X": marca desde X hasta hoy.
 *
 * Si dice que le bajó hace tres días, lleva tres días sangrando —
 * eso es lo que significa la frase. Solo rellena los dias que no
 * tengan ya un flujo puesto: lo que ella haya marcado a mano manda
 * sobre lo que deduzca la app.
 */
export function daysToFill(
  from: string,
  today: string,
  existing: Map<string, DayLog>,
): string[] {
  const total = differenceInCalendarDays(fromKey(today), fromKey(from));
  if (total < 0) return [from];

  const out: string[] = [];
  for (let i = 0; i <= total; i++) {
    const key = toKey(addDays(fromKey(from), i));
    if (existing.get(key)?.flow === undefined) out.push(key);
  }
  return out;
}
