import type { Settings } from "./db";

/* ═══════════════════════════════════════════════════════════════
   EDAD Y PAREJA

   La pareja (y con ella Cookie Monster y las pullas de Lilita) solo
   existe para mayores de 18. Con solo el año de nacimiento no se
   sabe si ya ha cumplido: quien nació hace justo 18 años lo dice en
   el onboarding, y si no lo ha dicho cuenta como menor.
   ═══════════════════════════════════════════════════════════════ */

export function edadMinima(birthYear: number, hoy = new Date()) {
  return hoy.getFullYear() - birthYear - 1;
}

export function esMenor(s: Pick<Settings, "birthYear" | "cumplidos18">, hoy = new Date()): boolean {
  if (s.birthYear === undefined) return false;
  const diferencia = hoy.getFullYear() - s.birthYear;
  if (diferencia > 18) return false;
  if (diferencia < 18) return true;
  return !s.cumplidos18;
}

/** El nombre de su pareja, o null si no tiene, no lo dice o es menor. */
export function nombrePareja(s: Pick<Settings, "birthYear" | "cumplidos18" | "partnerName">): string | null {
  if (esMenor(s)) return null;
  return s.partnerName?.trim() || null;
}

/** Las frases se escriben con {pareja}; sin pareja dice «alguien». */
export function conPareja(texto: string, nombre: string | null): string {
  return texto.replaceAll("{pareja}", nombre ?? "alguien");
}

export const TOKEN_PAREJA = "{pareja}";
