import type { CycleState } from "./cycle";
import { PHASE_LABEL } from "./cycle";
import { fromKey, type ChatSettings, type DayLog, type HumorLevel, type Memory } from "./db";
import type { Insight } from "./insights";

/* ═══════════════════════════════════════════════════════════════
   LO QUE SALE DEL MÓVIL

   Aquí decía que solo viajaban cifras derivadas y que sus notas no
   salían de aquí. Ya no es verdad, y ese día llegó como pedía el
   comentario viejo: como una decisión, no como un descuido.

   Ahora viajan tres cosas, y las dos últimas se pueden apagar por
   separado en Ajustes:

     1. CIFRAS DERIVADAS. Fase, día del ciclo, dolor de hoy, patrones.
        Siempre. Sin esto Lilita no sabe de qué habla.

     2. NOTAS RECIENTES, si `chat.readsNotes`. Solo las últimas y
        recortadas, y fechadas en relativo ("hace 3 días") en vez de
        con la fecha exacta: para lo que sirve la nota basta con eso.

     3. LO QUE RECUERDA, si `chat.remembers`. Frases que ella misma
        guardó en charlas anteriores. Se ven y se borran en Ajustes.

   Lo que sigue sin salir: el registro día a día completo, las fechas
   exactas de sus reglas y cualquier nota fuera de la ventana.
   ═══════════════════════════════════════════════════════════════ */

export interface LilitaContext {
  fase?: string;
  diaDelCiclo?: number;
  diaDeRegla?: number;
  sangrando: boolean;
  diasHastaLaProxima?: number;
  margenDias?: number;
  diasDeRetraso: number;
  cicloMedio: number;
  reglaMedia: number;
  ciclosRegistrados: number;
  confianza: CycleState["confidence"];
  dolorHoy?: number;
  diaDeMierda: boolean;
  /** Solo el titular de cada patrón, sin su base de cálculo */
  patrones: string[];
  humor: HumorLevel;
  /** Activa el modo cuidados: cero bromas */
  frenoDeMano: boolean;
  /** Notas recientes, fechadas en relativo. Vacío si está apagado. */
  notas: { cuando: string; texto: string }[];
  /** Lo que Lilita guardó en charlas anteriores. Vacío si apagado. */
  memorias: { id: string; texto: string }[];
  /**
   * Puede guardar memorias nuevas.
   *
   * Distinto de `memorias.length > 0`: el primer día la lista está
   * vacía y sí puede guardar, y con el interruptor recién apagado la
   * lista puede seguir teniendo cosas que ya no debe tocar.
   */
  puedeRecordar: boolean;
}

/** Cuántas notas se llevan y cuánto se recorta cada una. */
const MAX_NOTAS = 12;
const LARGO_NOTA = 240;

/** "hoy", "ayer", "hace 4 días" — y la fecha solo si ya queda lejos. */
function cuando(fecha: string, hoy: string): string {
  const dias = Math.round(
    (fromKey(hoy).getTime() - fromKey(fecha).getTime()) / 86400000,
  );
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  // Más de un mes: el "hace 47 días" ya no se entiende de un vistazo
  // y una fecha suelta sin año tampoco delata gran cosa.
  const [, m, d] = fecha.split("-");
  return `el ${Number(d)}/${Number(m)}`;
}

export function buildContext(
  state: CycleState,
  today: DayLog | undefined,
  humor: HumorLevel,
  insights: Insight[],
  extra?: {
    days?: DayLog[];
    memories?: Memory[];
    chat?: ChatSettings;
  },
): LilitaContext {
  const dolorHoy = today?.painLevel;
  const diaDeMierda = Boolean(today?.badDay);

  const notas =
    extra?.chat?.readsNotes && extra.days
      ? extra.days
          .filter((d) => d.note?.trim())
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, MAX_NOTAS)
          .map((d) => ({
            cuando: cuando(d.date, state.todayKey),
            texto: d.note!.trim().slice(0, LARGO_NOTA),
          }))
      : [];

  const memorias =
    extra?.chat?.remembers && extra.memories
      ? extra.memories.map((m) => ({ id: m.id, texto: m.text }))
      : [];

  return {
    notas,
    memorias,
    puedeRecordar: extra?.chat?.remembers === true,
    fase: state.phase ? PHASE_LABEL[state.phase] : undefined,
    diaDelCiclo: state.dayOfCycle,
    diaDeRegla: state.periodDay,
    sangrando: state.bleeding,
    diasHastaLaProxima: state.daysUntilNext,
    margenDias: state.model.spread,
    diasDeRetraso: state.daysLate,
    cicloMedio: state.model.length,
    reglaMedia: state.model.periodLength,
    ciclosRegistrados: state.model.basis,
    confianza: state.confidence,
    dolorHoy,
    diaDeMierda,
    patrones: insights.map((i) => i.title),
    humor,
    frenoDeMano: diaDeMierda || (dolorHoy ?? 0) >= 8,
  };
}

/** Huella del contexto: si no cambia, no hace falta regenerar nada. */
export function contextFingerprint(c: LilitaContext): string {
  return JSON.stringify([
    c.fase,
    c.diaDelCiclo,
    c.diaDeRegla,
    c.diasDeRetraso,
    c.dolorHoy,
    c.diaDeMierda,
    c.humor,
  ]);
}
