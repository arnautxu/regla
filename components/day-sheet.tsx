"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  db,
  fromKey,
  pillStreak,
  removeAngerEvent,
  removeCryEvent,
  setPill,
  setSex,
  toKey,
  upsertDay,
  type DayLog,
} from "@/lib/db";
import { summarize } from "@/lib/day-summary";
import {
  ANGER_LEVELS,
  ANIMOS,
  CRY_INTENSITIES,
  CRY_REASONS,
  SEX_ACTIVIDADES,
  SEX_PROTECCION,
  SINTOMAS,
  flowOptions,
  labelOf,
  labelsOf,
} from "@/lib/labels";
import { formatMinutes } from "@/lib/episodes";
import { capitalize } from "@/lib/format";
import { haptic, useLilaila } from "@/lib/use-lilaila";
import { FlowRow } from "./flow-row";
import { MoodRow, moodLabel } from "./mood-row";
import { PillRow } from "./pill-row";
import { SexRow } from "./sex-row";
import { TagPicker } from "./tag-picker";
import { LilitaFace } from "./lilita-face";
import {
  REACCION_ANIMO,
  REACCION_SINTOMA,
  reaccionDia,
  reaccionFlujo,
  reaccionPastilla,
  reaccionSexo,
  type Reaccion,
} from "@/lib/lilita/reacciones";

/**
 * Lo mínimo que necesita la hoja. DayCell del calendario encaja aquí
 * sin conversión, y la pantalla de Hoy puede construirlo a mano para
 * abrir el día de hoy sin pasar por el calendario.
 */
export interface SheetDay {
  key: string;
  date: Date;
  isToday: boolean;
  isFuture: boolean;
}

/** El día de al lado, en clave 'YYYY-MM-DD'. */
function vecino(key: string, delta: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

/* Arrastrar la hoja hacia abajo para cerrarla. La rayita de arriba
   lo promete, y hasta ahora no había nada detrás: el dedo bajaba y la
   hoja ni se movía.

   Con touch* y no con pointer*: en iPhone, en cuanto Safari decide
   que el gesto es un scroll lanza pointercancel y el arrastre muere a
   medias. Y el listener va a mano con passive:false, porque el de
   React es pasivo y su preventDefault no frena el rebote de Safari.

   Desde la cabecera o el pie se arrastra siempre. Desde el cuerpo
   solo si ya está arriba del todo: si no, ese dedo hacia abajo es
   volver a subir por la hoja, no cerrarla. */
const CIERRA_PX = 110;
const CIERRA_VELOCIDAD = 0.5; // px/ms: un tirón corto y rápido también cierra

function useSwipeToClose(
  panel: RefObject<HTMLDivElement | null>,
  abierta: boolean,
  cerrar: () => void,
) {
  const cerrarRef = useRef(cerrar);
  useEffect(() => {
    cerrarRef.current = cerrar;
  });

  useEffect(() => {
    const el = panel.current;
    if (!abierta || !el) return;

    let inicioY = 0;
    let inicioX = 0;
    let inicioT = 0;
    let dy = 0;
    let puede = false;
    // null: aún no se sabe si es arrastre o scroll.
    let arrastrando: boolean | null = null;

    const mover = (y: number, ms: number) => {
      el.style.transition = ms ? `transform ${ms}ms var(--ease-out-quart)` : "none";
      el.style.transform = y ? `translateY(${y}px)` : "";
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        arrastrando = false;
        return;
      }
      const t = e.touches[0];
      inicioY = t.clientY;
      inicioX = t.clientX;
      inicioT = e.timeStamp;
      dy = 0;
      arrastrando = null;
      const cuerpo = el.querySelector<HTMLElement>("[data-sheet-body]");
      const enCuerpo = cuerpo?.contains(e.target as Node) ?? false;
      puede = !enCuerpo || (cuerpo?.scrollTop ?? 0) <= 0;
    };

    const onMove = (e: TouchEvent) => {
      if (arrastrando === false || !puede) return;
      const t = e.touches[0];
      const y = t.clientY - inicioY;
      const x = t.clientX - inicioX;
      if (arrastrando === null) {
        // Hacia abajo y desde arriba del todo, Safari solo haría el
        // rebote: se frena ya, antes de decidir, o luego ya no deja.
        if (y > 0) e.preventDefault();
        if (Math.abs(y) < 8 && Math.abs(x) < 8) return;
        arrastrando = y > 0 && y > Math.abs(x);
        if (!arrastrando) return;
      }
      e.preventDefault();
      dy = Math.max(0, y);
      mover(dy, 0);
    };

    const onEnd = (e: TouchEvent) => {
      if (!arrastrando) {
        arrastrando = null;
        return;
      }
      arrastrando = null;
      const velocidad = dy / Math.max(1, e.timeStamp - inicioT);
      if (dy > CIERRA_PX || (dy > 40 && velocidad > CIERRA_VELOCIDAD)) {
        haptic(6);
        mover(el.offsetHeight, 200);
        window.setTimeout(() => cerrarRef.current(), 190);
      } else {
        mover(0, 220);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      // La próxima vez que se abra, que no aparezca medio bajada.
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [panel, abierta]);
}


/* ═══════════════════════════════════════════════════════════════
   UNA PREGUNTA CADA VEZ

   La hoja era el formulario entero abierto de golpe: siete bloques,
   cuarenta botones y una nota, todos a la vez y todos con el mismo
   peso. Para apuntar "poco, regular" había que encontrar dos filas
   entre todo eso, y para saber qué quedaba por contestar había que
   leer cuál de los cuarenta estaba encendido.

   Ahora va por pasos. Cada paso es una pregunta en grande, con sus
   botones grandes. Las de una sola respuesta avanzan solas al tocar;
   las de varias tienen "Seguir" (o "Nada", si no marcas ninguna). Al
   final, el día en una lista: cada fila dice lo apuntado y se toca
   para cambiarla, y desde ahí se vuelve directo a la lista.

   Un día que ya tiene sangrado y "cómo va" abre directamente en la
   lista: volver a pasar por todas las preguntas para cambiar una
   sería castigar a quien ya lo había hecho.
   ═══════════════════════════════════════════════════════════════ */

export type Paso = "flow" | "dia" | "duele" | "animo" | "pastilla" | "sexo" | "resumen";

/** Lo que tarda en pasar a la siguiente pregunta tras un toque: lo
    justo para ver el botón encenderse y leer lo que contesta Lilita. */
const AVANCE_MS = 750;

/** Lo que tiene que recorrer el dedo de lado para cambiar de pregunta. */
const DESLIZA_PX = 60;

const NOMBRE: Record<Paso, string> = {
  flow: "Sangrado",
  dia: "Cómo va el día",
  duele: "Qué te duele",
  animo: "Ánimo",
  pastilla: "Pastilla",
  sexo: "Sexo",
  resumen: "El día entero",
};

function pregunta(paso: Paso, hoy: boolean, acabaRegla: boolean): { titulo: string; ayuda?: string } {
  switch (paso) {
    case "flow":
      return {
        titulo: hoy ? "¿Cuánto sangras hoy?" : "¿Cuánto sangraste?",
        ayuda: acabaRegla ? "Si ya no, «Se acabó» cierra la regla." : undefined,
      };
    case "dia":
      return { titulo: hoy ? "¿Cómo va el día?" : "¿Qué tal fue el día?" };
    case "duele":
      return { titulo: hoy ? "¿Te duele algo?" : "¿Te dolió algo?", ayuda: "Marca todo lo que toque." };
    case "animo":
      return { titulo: "¿Y de ánimo?", ayuda: "Puede ser más de una." };
    case "pastilla":
      return { titulo: hoy ? "¿Te has tomado la pastilla?" : "¿Te tomaste la pastilla?" };
    case "sexo":
      return { titulo: hoy ? "¿Ha habido sexo?" : "¿Hubo sexo?" };
    case "resumen":
      return { titulo: "Así queda el día" };
  }
}

/** ¿Está contestado este paso? Lo que pinta la barra de progreso. */
function contestadoEn(paso: Paso, log: DayLog | null | undefined): boolean {
  if (!log) return false;
  switch (paso) {
    case "flow":
      return log.flow !== undefined;
    case "dia":
      return log.painLevel !== undefined;
    case "duele":
      return !!log.symptoms?.length;
    case "animo":
      return !!log.mood?.length;
    case "pastilla":
      return log.pill !== undefined;
    case "sexo":
      return log.sex !== undefined;
    case "resumen":
      return false;
  }
}

/** Dónde se abre: en la primera de las dos preguntas de cada día que
    falte, o en la lista si ya están las dos. */
function pasoInicial(log: DayLog | null): Paso {
  if (log?.flow === undefined) return "flow";
  if (log.painLevel === undefined) return "dia";
  return "resumen";
}

function hora(iso: string | undefined): string | undefined {
  return iso
    ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : undefined;
}

export function DaySheet({
  day: base,
  startAt,
  onClose,
  onPeriodStart,
}: {
  day: SheetDay | null;
  /** Abrir directamente en esta pregunta (las casillas de Hoy). Sin
      él, la hoja decide según lo que ya haya apuntado. */
  startAt?: Paso;
  onClose: () => void;
  /**
   * Ha empezado una regla nueva aquí dentro.
   *
   * Se avisa al CERRAR y no al marcarlo: el efecto es Lilita cruzando
   * la pantalla entera, y esta hoja es un <dialog> modal — o sea, la
   * capa superior del navegador. Lanzarlo con la hoja abierta sería
   * animar algo por detrás de ella que no se ve.
   */
  onPeriodStart?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { settings, cycles, dateKey: hoyKey } = useLilaila();
  const empezoRegla = useRef(false);
  const avance = useRef<number | undefined>(undefined);

  // <dialog> nativo: da trampa de foco, Escape y scroll bloqueado sin
  // escribirlos a mano, y todos suelen salir mal escritos a mano.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (base && !el.open) {
      el.showModal();
      // Si no, el navegador enfoca el primer botón (la flecha ‹) y en
      // iPhone se queda con el aro rojo de foco nada más abrir.
      panel.current?.focus({ preventScroll: true });
    }
    if (!base && el.open) el.close();
  }, [base]);

  useEffect(() => () => window.clearTimeout(avance.current), []);

  const abierta = Boolean(base);
  useSwipeToClose(panel, abierta, () => ref.current?.close());

  // Se ajusta DURANTE el render y no en un efecto: es el patrón que
  // documenta React para "resetear estado cuando cambia una prop", y
  // el efecto además repintaba una vez de más — se veía el detalle
  // del día anterior abierto durante un fotograma al saltar de día.
  const [cryError, setCryError] = useState("");
  // Las flechas ‹ › mueven la hoja por días sin volver al calendario.
  // El desplazamiento vuelve a 0 cada vez que se abre en otro día.
  const [offset, setOffset] = useState(0);
  // null = todavía sin decidir: se decide en cuanto llega el día de
  // la base de datos (ver pasoInicial).
  const [paso, setPaso] = useState<Paso | null>(startAt ?? null);
  // Se ha entrado a una pregunta desde la lista: al contestarla se
  // vuelve a la lista, no a la pregunta siguiente.
  const [volver, setVolver] = useState(false);
  // Lo que acaba de contestar Lilita a la última respuesta. Se borra
  // al cambiar de pregunta: cada pregunta empieza con su cara neutra.
  const [reaccion, setReaccion] = useState<Reaccion | null>(null);
  // Hacia dónde entra la pregunta nueva: adelante desde la derecha,
  // atrás desde la izquierda. Que el gesto y la animación coincidan.
  const [sentido, setSentido] = useState<1 | -1>(1);
  // Se ha llegado a la lista contestando de corrido: Lilita lo celebra.
  const [terminado, setTerminado] = useState(false);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [ultimaClave, setUltimaClave] = useState(base?.key);
  if (base?.key !== ultimaClave) {
    setUltimaClave(base?.key);
    setOffset(0);
    setCryError("");
    setPaso(startAt ?? null);
    setVolver(false);
    setReaccion(null);
    setTerminado(false);
  }

  const day: SheetDay | null = useMemo(() => {
    if (!base) return null;
    if (offset === 0) return base;
    const key = vecino(base.key, offset);
    return { key, date: fromKey(key), isToday: key === hoyKey, isFuture: key > hoyKey };
  }, [base, offset, hoyKey]);

  // Con la clave dentro: al saltar de día, useLiveQuery sigue
  // devolviendo el día anterior hasta que llega el nuevo, y el paso
  // inicial se decidiría con lo que no es.
  const leido = useLiveQuery(
    async () => (day ? { key: day.key, log: (await db.days.get(day.key)) ?? null } : null),
    [day?.key],
  );
  const log = leido && day && leido.key === day.key ? leido.log : undefined;

  if (paso === null && day && log !== undefined) {
    setPaso(day.isFuture ? "resumen" : pasoInicial(log));
  }

  // La racha necesita todos los días, así que solo se calcula con la
  // hoja abierta y la pastilla encendida. Sin esas dos guardas, cada
  // celda del calendario tendría detrás una consulta a la tabla entera.
  const streak = useLiveQuery(
    async () =>
      day && settings.pill.enabled
        ? pillStreak(await db.days.toArray(), day.key)
        : 0,
    [day?.key, settings.pill.enabled],
  );

  const resumen = useMemo(
    () => summarize(log ?? undefined, day?.key ?? "", cycles),
    [log, day?.key, cycles],
  );

  /* ¿Marcar "nada" aquí termina la regla?
     Solo si el día ANTERIOR sangró y el SIGUIENTE no.

     Lo de mirar el siguiente no es un detalle: el modelo tolera un
     día de pausa dentro de la misma regla (MAX_GAP), así que en un
     día con sangre a los dos lados marcar 0 no acaba nada — la racha
     lo salta y sigue. Sin esa comprobación, el botón prometía un
     final que no iba a ocurrir cada vez que ella corrigiera un día
     de en medio. */
  const vecinos = useLiveQuery(
    async () =>
      day
        ? {
            ayer: (await db.days.get(vecino(day.key, -1)))?.flow,
            manyana: (await db.days.get(vecino(day.key, 1)))?.flow,
          }
        : null,
    [day?.key],
  );
  const terminaLaRegla = Boolean(
    vecinos?.ayer && vecinos.ayer > 0 && !(vecinos.manyana && vecinos.manyana > 0),
  );

  const pasos: Paso[] = useMemo(
    () => [
      "flow",
      "dia",
      "duele",
      "animo",
      ...(settings.pill.enabled ? (["pastilla"] as const) : []),
      "sexo",
      "resumen",
    ],
    [settings.pill.enabled],
  );
  const actual = paso ?? null;
  const indice = actual ? pasos.indexOf(actual) : -1;

  function irA(p: Paso, hacia: 1 | -1 = 1) {
    window.clearTimeout(avance.current);
    setSentido(hacia);
    setReaccion(null);
    setTerminado(false);
    setPaso(p);
  }

  function siguiente() {
    if (volver) {
      setVolver(false);
      irA("resumen");
      return;
    }
    const p = pasos[Math.min(indice + 1, pasos.length - 1)];
    irA(p);
    if (p === "resumen") setTerminado(true);
  }

  function atras() {
    if (volver) {
      setVolver(false);
      irA("resumen", -1);
      return;
    }
    if (indice > 0) irA(pasos[indice - 1], -1);
  }

  /** Tras una pregunta de una sola respuesta: Lilita contesta y, si se
      ha marcado algo, a la siguiente. Si se ha desmarcado, se queda:
      está corrigiendo. */
  function contestada(r: Reaccion | null) {
    window.clearTimeout(avance.current);
    setReaccion(r);
    if (r) avance.current = window.setTimeout(siguiente, AVANCE_MS);
  }

  function cambiarDia(delta: number) {
    haptic(6);
    window.clearTimeout(avance.current);
    setOffset((o) => o + delta);
    setPaso(null);
    setVolver(false);
  }

  const q = actual ? pregunta(actual, day?.isToday ?? false, terminaLaRegla) : null;

  return (
    <dialog
      ref={ref}
      onClose={() => {
        // Al volver a abrirla, siempre en el día que se tocó, no en el
        // último al que se llegó con las flechas.
        window.clearTimeout(avance.current);
        setOffset(0);
        setPaso(null);
        setVolver(false);
        onClose();
        if (empezoRegla.current) {
          empezoRegla.current = false;
          onPeriodStart?.();
        }
      }}
      // pointerdown y no click: el clic que ABRE la hoja termina de
      // procesarse cuando showModal() ya la ha puesto en la capa
      // superior, asi que su evento 'click' le llega al backdrop y la
      // cierra al instante. El pointerdown que la abrio ocurrio antes
      // de que el dialogo existiera, de modo que aqui solo entran
      // pulsaciones nuevas.
      onPointerDown={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="sheet"
      aria-label={day ? format(day.date, "d 'de' MMMM", { locale: es }) : ""}
    >
      {day && (
        <div ref={panel} tabIndex={-1} className="sheet-panel flex flex-col outline-none">
          {/* Cabecera, cuerpo y pie como tres piezas: solo el cuerpo se
              desplaza, si hace falta. */}
          <div className="flex shrink-0 flex-col gap-xs px-lg pt-sm">
            <div
              aria-hidden="true"
              className="mx-auto h-1 w-10 rounded-full"
              style={{ background: "var(--border-strong)" }}
            />

            <header className="flex items-start justify-between gap-md">
              <div>
                <h2 className="font-display text-lg font-bold tracking-[-0.02em]">
                  {/* date-fns da los días en minúscula en es; en un título
                      eso se lee como una errata. */}
                  {day.isToday
                    ? `Hoy, ${format(day.date, "EEEE d", { locale: es })}`
                    : capitalize(format(day.date, "EEEE d 'de' MMMM", { locale: es }))}
                </h2>
                <p className="text-xs text-faint">{resumen.estado}</p>
              </div>
              <div className="-mr-2 flex shrink-0">
                {[
                  { delta: -1, label: "Día anterior", d: "M14.5 5 L8 12 L14.5 19", off: false },
                  { delta: 1, label: "Día siguiente", d: "M9.5 5 L16 12 L9.5 19", off: day.key >= hoyKey },
                ].map((b) => (
                  <button
                    key={b.delta}
                    type="button"
                    aria-label={b.label}
                    disabled={b.off}
                    onClick={() => cambiarDia(b.delta)}
                    className="flex size-10 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-25"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={b.d} />
                    </svg>
                  </button>
                ))}
              </div>
            </header>

            {/* Por dónde vas: un tramo por pregunta, cuadrados y con
                huecos finos como el anillo de Hoy. Relleno = ya
                contestada. Cada tramo se toca para saltar ahí. */}
            {!day.isFuture && actual && (
              <nav aria-label="Preguntas del día" className="-mx-1 flex">
                {pasos.map((p) => {
                  const hecho = p === "resumen" ? false : contestadoEn(p, log);
                  const aqui = p === actual;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-label={NOMBRE[p]}
                      aria-current={aqui ? "step" : undefined}
                      onClick={() => {
                        haptic(6);
                        setVolver(false);
                        irA(p, pasos.indexOf(p) < indice ? -1 : 1);
                      }}
                      className="flex flex-1 items-center px-px py-2"
                    >
                      <span
                        className="h-1.5 w-full transition-colors duration-200"
                        style={{
                          background: aqui
                            ? "var(--fg)"
                            : hecho
                              ? "var(--accent)"
                              : "var(--border)",
                        }}
                      />
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          <div
            data-sheet-body
            // Deslizar de lado cambia de pregunta: hacia la izquierda la
            // siguiente, hacia la derecha la anterior. Solo si el gesto
            // es claramente horizontal; el vertical es del scroll y de
            // cerrar la hoja.
            onTouchStart={(e) => {
              const t = e.touches[0];
              toque.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const ini = toque.current;
              toque.current = null;
              if (!ini || !actual || actual === "resumen" || day.isFuture) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - ini.x;
              const dy = t.clientY - ini.y;
              if (Math.abs(dx) < DESLIZA_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
              haptic(6);
              if (dx < 0) siguiente();
              else atras();
            }}
            className="flex min-h-[340px] flex-1 flex-col gap-md overflow-y-auto overscroll-contain px-lg pt-xs pb-md">
            {day.isFuture ? (
              <p className="text-sm leading-relaxed text-muted">
                Este día todavía no ha pasado. Cuando llegue me cuentas.
              </p>
            ) : actual && q ? (
              <div
                key={`${day.key}-${actual}`}
                className={`${sentido === 1 ? "paso-in" : "paso-in-atras"} flex flex-col gap-md`}
              >
                {actual === "resumen" ? (
                  <>
                    {/* La lista no es una pregunta: título oculto, que
                        quepan las filas y la nota sin desplazar. Si se
                        acaba de contestar todo de corrido, Lilita lo
                        celebra en una línea. */}
                    <h3 className="sr-only">{q.titulo}</h3>
                    {terminado && (
                      <div className="flex items-center gap-3">
                        <LilitaFace mood="energica" size={44} />
                        <p className="reaccion-in font-display text-base font-bold leading-tight">
                          ¡Día apuntado! Aquí lo tienes todo.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  /* Lilita hace la pregunta, y contesta a lo que
                     marcas: la cara cambia y la frase de ayuda deja
                     paso a la suya. */
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 pt-0.5">
                      <LilitaFace mood={reaccion?.cara ?? "neutral"} size={52} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-balance font-display text-2xl font-bold leading-[1.1] tracking-[-0.02em]">
                        {q.titulo}
                      </h3>
                      <p
                        key={reaccion?.texto ?? "ayuda"}
                        aria-live="polite"
                        className={`mt-1 min-h-[1.25rem] text-sm ${reaccion ? "reaccion-in font-semibold" : "text-muted"}`}
                        style={reaccion ? { color: "var(--accent)" } : undefined}
                      >
                        {reaccion?.texto ?? q.ayuda ?? ""}
                      </p>
                    </div>
                  </div>
                )}

                {actual === "flow" && (
                  <FlowRow
                    bare
                    value={log?.flow}
                    onChange={(v) => {
                      // Empieza una regla NUEVA: ni ese día sangraba ya ni
                      // hay ninguna abierta. Es el único caso que merece
                      // la fanfarria; los días siguientes son continuar.
                      const yaSangraba = log?.flow !== undefined && log.flow > 0;
                      const ultima = cycles[cycles.length - 1];
                      if (v !== undefined && v > 0 && !yaSangraba && !(ultima && !ultima.endDate)) {
                        empezoRegla.current = true;
                      }
                      void upsertDay(day.key, { flow: v });
                      contestada(v === undefined ? null : reaccionFlujo(v, terminaLaRegla));
                    }}
                    dateKey={day.key}
                    endsPeriod={terminaLaRegla}
                  />
                )}

                {actual === "dia" && (
                  <MoodRow
                    bare
                    value={log ?? undefined}
                    onChange={(patch) => {
                      void upsertDay(day.key, patch);
                      contestada(
                        patch.painLevel === undefined
                          ? null
                          : reaccionDia(patch.painLevel, patch.badDay),
                      );
                    }}
                    dateKey={day.key}
                  />
                )}

                {actual === "duele" && (
                  <TagPicker
                    bare
                    label="Qué te duele"
                    options={SINTOMAS}
                    selected={log?.symptoms ?? []}
                    onToggle={(v) => {
                      if (!log?.symptoms?.includes(v)) setReaccion(REACCION_SINTOMA[v]);
                      void upsertDay(day.key, { symptoms: toggle(log?.symptoms, v) });
                    }}
                  />
                )}

                {actual === "animo" && (
                  <TagPicker
                    bare
                    label="Ánimo"
                    options={ANIMOS}
                    selected={log?.mood ?? []}
                    onToggle={(v) => {
                      if (!log?.mood?.includes(v)) setReaccion(REACCION_ANIMO[v]);
                      void upsertDay(day.key, { mood: toggle(log?.mood, v) });
                    }}
                  />
                )}

                {actual === "pastilla" && (
                  <PillRow
                    bare
                    value={log?.pill}
                    takenAt={log?.pillAt}
                    streak={streak}
                    onChange={(v) => {
                      void setPill(day.key, v, day.isToday ? new Date() : undefined);
                      contestada(v === undefined ? null : reaccionPastilla(v));
                    }}
                    dateKey={day.key}
                  />
                )}

                {actual === "sexo" && (
                  <>
                    <SexRow
                      bare
                      only="answer"
                      log={log ?? undefined}
                      onSet={(v) => {
                        void setSex(day.key, v);
                        // Con un sí se queda: viene el detalle debajo.
                        if (v === true) setReaccion(reaccionSexo(true));
                        else contestada(v === false ? reaccionSexo(false) : null);
                      }}
                      onPatch={(patch) => void upsertDay(day.key, patch)}
                      dateKey={day.key}
                    />
                    <SexRow
                      only="detail"
                      log={log ?? undefined}
                      onSet={(v) => void setSex(day.key, v)}
                      onPatch={(patch) => void upsertDay(day.key, patch)}
                      dateKey={day.key}
                    />
                  </>
                )}

                {actual === "resumen" && (
                  <Resumen
                    log={log ?? undefined}
                    pasos={pasos}
                    acabaRegla={terminaLaRegla}
                    onEditar={(p) => {
                      haptic(8);
                      setVolver(true);
                      irA(p);
                    }}
                  />
                )}

                {actual === "resumen" && !!log?.cryEvents?.length && (
                  <section aria-label="Episodios PAS" className="flex flex-col gap-2">
                    {log.cryEvents.map((event) => (
                      <div key={event.id} className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg)" }}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">
                            💧 {labelOf(CRY_REASONS, event.reason) ?? "PAS"}
                            <span className="ml-2 font-normal text-faint">{hora(event.at)}</span>
                          </p>
                          <button
                            type="button"
                            className="shrink-0 text-xs underline underline-offset-2"
                            style={{ color: "var(--fg-muted)" }}
                            aria-label="Eliminar este episodio PAS"
                            onClick={() => {
                              if (!window.confirm("¿Eliminar este episodio PAS?")) return;
                              haptic(8);
                              setCryError("");
                              void removeCryEvent(day.key, event.id).catch(() =>
                                setCryError("No se ha podido eliminar este PAS."),
                              );
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                        {event.intensity && (
                          <p className="mt-1 text-xs text-muted">
                            Intensidad: {CRY_INTENSITIES.find((option) => option.value === event.intensity)?.label.toLowerCase()}
                          </p>
                        )}
                        {event.note && <p className="mt-1 whitespace-pre-wrap text-muted">{event.note}</p>}
                      </div>
                    ))}
                    {cryError && <p className="text-xs" style={{ color: "var(--accent)" }} role="alert">{cryError}</p>}
                  </section>
                )}

                {actual === "resumen" && !!log?.angerEvents?.length && (
                  <section aria-label="Cookie Monster" className="flex flex-col gap-2">
                    {log.angerEvents.map((event) => (
                      <div key={event.id} className="rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--cookie-bg)" }}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold" style={{ color: "var(--cookie)" }}>
                            🍪 {labelOf(ANGER_LEVELS, event.level) ?? "Cookie Monster"}
                            <span className="ml-2 font-normal text-faint">{hora(event.at)}</span>
                          </p>
                          <button
                            type="button"
                            className="shrink-0 text-xs underline underline-offset-2"
                            style={{ color: "var(--fg-muted)" }}
                            aria-label="Eliminar este enfado"
                            onClick={() => {
                              if (!window.confirm("¿Eliminar este enfado?")) return;
                              haptic(8);
                              setCryError("");
                              void removeAngerEvent(day.key, event.id).catch(() =>
                                setCryError("No se ha podido eliminar este enfado."),
                              );
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {event.endedAt
                            ? `Se pasó en ${formatMinutes(Math.max(1, (new Date(event.endedAt).getTime() - new Date(event.at).getTime()) / 60000))}`
                            : "Sin cerrar con «se me ha pasado»"}
                        </p>
                      </div>
                    ))}
                  </section>
                )}

                {actual === "resumen" && (
                  <section>
                    <label
                      htmlFor={`nota-${day.key}`}
                      className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint"
                    >
                      Nota
                    </label>
                    <textarea
                      key={day.key}
                      id={`nota-${day.key}`}
                      defaultValue={log?.note ?? ""}
                      onBlur={(e) =>
                        void upsertDay(day.key, {
                          note: e.target.value.trim() || undefined,
                        })
                      }
                      rows={1}
                      placeholder="Lo que quieras acordarte"
                      className="mt-1.5 w-full resize-none rounded-xl px-3 py-2 text-sm outline-none field-sizing-content"
                      style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--border)" }}
                    />
                  </section>
                )}
              </div>
            ) : null}
          </div>

          {/* El pie cambia con el paso. En las preguntas: volver atrás
              y seguir (o saltar). En la lista: "Listo". Cada toque
              escribe al momento, así que saltar o cerrar a medias no
              pierde nada de lo ya marcado. */}
          <div
            className="flex shrink-0 items-center gap-md border-t border-line px-lg pt-sm"
            style={{ paddingBottom: "calc(var(--spacing-sm) + env(safe-area-inset-bottom))" }}
          >
            {day.isFuture || actual === "resumen" || !actual ? (
              <>
                <p className="flex-1 text-xs font-semibold" style={{ color: "var(--ok)" }}>
                  {day.isFuture ? "" : "✓ Se guarda al momento"}
                </p>
                <PieBoton fuerte onClick={() => ref.current?.close()}>
                  Listo
                </PieBoton>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    haptic(6);
                    atras();
                  }}
                  disabled={indice <= 0 && !volver}
                  className="flex min-h-[46px] items-center gap-1 pr-2 text-sm font-semibold disabled:opacity-0"
                  style={{ color: "var(--fg-muted)" }}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14.5 5 L8 12 L14.5 19" />
                  </svg>
                  {volver ? "Lista" : "Atrás"}
                </button>
                <span className="flex-1" />
                {(() => {
                  const hecho = contestadoEn(actual, log);
                  const multiple = actual === "duele" || actual === "animo";
                  const texto = volver
                    ? "Hecho"
                    : hecho
                      ? "Seguir"
                      : multiple
                        ? "Nada"
                        : "Saltar";
                  return (
                    <PieBoton
                      fuerte={hecho || volver}
                      onClick={() => {
                        haptic(8);
                        siguiente();
                      }}
                    >
                      {texto}
                    </PieBoton>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

function PieBoton({
  fuerte,
  onClick,
  children,
}: {
  fuerte?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[46px] min-w-[120px] rounded-full px-xl font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow,background-color] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
      style={
        fuerte
          ? {
              background: "var(--accent)",
              color: "var(--on-accent)",
              boxShadow: "3px 3px 0 0 var(--depth-shadow)",
            }
          : {
              background: "var(--surface)",
              color: "var(--fg)",
              boxShadow: "inset 0 0 0 1.5px var(--border-strong)",
            }
      }
    >
      {children}
    </button>
  );
}

/* ── La lista del final ─────────────────────────────────────────
   Una fila por pregunta, con lo apuntado en palabras. Lo que falta
   se dice ("Sin contestar") en vez de esconderse: así se ve de un
   vistazo qué queda, y tocarlo lleva directo a esa pregunta. */

function Resumen({
  log,
  pasos,
  acabaRegla,
  onEditar,
}: {
  log: DayLog | undefined;
  pasos: Paso[];
  acabaRegla: boolean;
  onEditar: (paso: Paso) => void;
}) {
  function valor(p: Paso): string | undefined {
    if (!log) return undefined;
    switch (p) {
      case "flow":
        return labelOf(flowOptions(acabaRegla), log.flow);
      case "dia":
        return moodLabel(log);
      case "duele":
        return labelsOf(SINTOMAS, log.symptoms).join(", ") || undefined;
      case "animo":
        return labelsOf(ANIMOS, log.mood).join(", ") || undefined;
      case "pastilla": {
        if (log.pill === false) return "Hoy no";
        if (log.pill !== true) return undefined;
        const h = hora(log.pillAt);
        return h ? `Tomada a las ${h}` : "Tomada";
      }
      case "sexo": {
        if (log.sex === false) return "No";
        if (log.sex !== true) return undefined;
        return [
          "Sí",
          ...labelsOf(SEX_ACTIVIDADES, log.sexActivities).map((s) => s.toLowerCase()),
          ...labelsOf(SEX_PROTECCION, log.sexProtection).map((s) => s.toLowerCase()),
          ...(log.sexOrgasm ? ["me corrí"] : []),
        ].join(" · ");
      }
      case "resumen":
        return undefined;
    }
  }

  return (
    <ul className="-mt-2 flex flex-col">
      {pasos
        .filter((p) => p !== "resumen")
        .map((p) => {
          const v = valor(p);
          return (
            <li key={p} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onEditar(p)}
                className="flex w-full items-center gap-md py-2.5 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    {NOMBRE[p]}
                  </span>
                  <span
                    className="truncate text-[15px] leading-snug"
                    style={{
                      color: v ? "var(--fg)" : "var(--fg-faint)",
                      fontWeight: v ? 600 : 450,
                    }}
                  >
                    {v ?? "Sin contestar"}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xs font-semibold"
                  style={{ color: v ? "var(--fg-faint)" : "var(--accent)" }}
                >
                  {v ? "Cambiar ›" : "Contestar ›"}
                </span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}
