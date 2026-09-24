import { differenceInCalendarDays } from "date-fns";
import { fromKey, type Cycle, type DayLog } from "./db";
import {
  ANIMOS,
  FLOW,
  SEX_ACTIVIDADES,
  SEX_PROTECCION,
  SINTOMAS,
  labelOf,
  labelsOf,
} from "./labels";

/* ═══════════════════════════════════════════════════════════════
   EL DÍA, EN CRISTIANO

   La ficha del día era el formulario entero: seis controles abiertos
   a la vez, y para saber qué había apuntado ese día tenías que leer
   cuál de los botones estaba encendido en cada fila. Contestaba
   "¿qué quieres cambiar?" cuando la pregunta al tocar un día del
   calendario es "¿qué pasó aquí?".

   Esto convierte el registro en frases. Solo aparece lo que hay: un
   día sin nada no enseña seis "sin marcar", enseña que no hay nada.
   ═══════════════════════════════════════════════════════════════ */

export interface DaySummary {
  /** Una línea de estado para la cabecera: "Día 4 de regla" */
  estado?: string;
  /** Lo apuntado, ya redactado */
  lineas: string[];
  /** La nota va aparte: es suya y se pinta como cita, no como dato */
  nota?: string;
}

/** En qué día de regla cae esa fecha, si cae en alguna. */
function diaDeRegla(cycles: Cycle[], key: string): number | undefined {
  for (const c of cycles) {
    const fin = c.endDate ?? key;
    if (key >= c.startDate && key <= fin) {
      return differenceInCalendarDays(fromKey(key), fromKey(c.startDate)) + 1;
    }
  }
  return undefined;
}

export function summarize(
  day: DayLog | undefined,
  key: string,
  cycles: Cycle[],
): DaySummary {
  const lineas: string[] = [];

  const sangro = day?.flow !== undefined && day.flow > 0;
  const n = sangro ? diaDeRegla(cycles, key) : undefined;

  // Sangrado. El "flujo 0" se dice como lo que significa según el
  // contexto: en mitad de una regla es que se acabó, y suelto es
  // simplemente que ese día no manchó.
  if (day?.flow !== undefined) {
    if (day.flow === 0) {
      lineas.push(
        diaDeRegla(cycles, anterior(key)) !== undefined
          ? "Aquí se acabó la regla"
          : "Sin sangrado",
      );
    } else {
      lineas.push(`Sangrado ${labelOf(FLOW, day.flow)!.toLowerCase()}`);
    }
  }

  if (day?.pill === true) {
    const hora = day.pillAt
      ? new Date(day.pillAt).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    lineas.push(hora ? `Pastilla tomada a las ${hora}` : "Pastilla tomada");
  } else if (day?.pill === false) {
    lineas.push("Pastilla saltada");
  }

  if (day?.sex === true) {
    const partes = [
      ...labelsOf(SEX_ACTIVIDADES, day.sexActivities),
      ...labelsOf(SEX_PROTECCION, day.sexProtection).map(
        (p) => `protección: ${p.toLowerCase()}`,
      ),
    ];
    if (day.sexOrgasm) partes.push("se corrió");
    lineas.push(partes.length ? `Sexo · ${partes.join(" · ")}` : "Sexo");
  }

  // El ánimo de MoodRow se guarda como número de dolor, así que se
  // traduce de vuelta a la palabra que ella pulsó.
  if (day?.painLevel !== undefined) {
    const comoFue = day.badDay
      ? "de mierda"
      : day.painLevel >= 7
        ? "mal"
        : day.painLevel >= 3
          ? "regular"
          : "bien";
    lineas.push(`El día, ${comoFue}`);
  }

  const sintomas = labelsOf(SINTOMAS, day?.symptoms);
  if (sintomas.length) lineas.push(sintomas.join(", "));

  const animos = labelsOf(ANIMOS, day?.mood);
  if (animos.length) lineas.push(animos.join(", "));

  const cries = day?.cryEvents?.length ?? 0;
  if (cries) lineas.push(`PAS · ${cries === 1 ? "1 episodio de llanto" : `${cries} episodios de llanto`}`);

  return {
    estado: n !== undefined ? `Día ${n} de regla` : undefined,
    lineas,
    nota: day?.note?.trim() || undefined,
  };
}

function anterior(key: string): string {
  const d = fromKey(key);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
