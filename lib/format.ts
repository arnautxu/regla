import { format, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";

/**
 * "entre el 20 y el 22 de agosto", y con los dos meses cuando el
 * rango los cruza: "entre el 31 de agosto y el 2 de septiembre".
 *
 * Vive aquí y no en cada pantalla porque ya divergió una vez: Hoy
 * omitía el mes de la primera fecha y soltaba "entre el 31 y el 2 de
 * septiembre", que se lee como una errata.
 */
export function dateRange(start: Date, end?: Date): string {
  const long = "d 'de' MMMM";
  if (!end) return `el ${format(start, long, { locale: es })}`;

  return isSameMonth(start, end)
    ? `entre el ${format(start, "d", { locale: es })} y el ${format(end, long, { locale: es })}`
    : `entre el ${format(start, long, { locale: es })} y el ${format(end, long, { locale: es })}`;
}

/**
 * "del 4 al 8 de agosto", cruzando meses cuando hace falta, y "el 4
 * de agosto" para un día suelto.
 *
 * Convive con dateRange y no lo sustituye: aquel dice "entre el X y
 * el Y" porque habla de una fecha INCIERTA dentro de un margen, y
 * este dice "del X al Y" porque habla de un tramo entero que ocurre.
 * Cambiarlos de sitio convierte una estimación en una promesa.
 */
export function dayRange(start: Date, end?: Date): string {
  const long = "d 'de' MMMM";
  if (!end || start.getTime() === end.getTime()) {
    return `el ${format(start, long, { locale: es })}`;
  }

  return isSameMonth(start, end)
    ? `del ${format(start, "d", { locale: es })} al ${format(end, long, { locale: es })}`
    : `del ${format(start, long, { locale: es })} al ${format(end, long, { locale: es })}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
