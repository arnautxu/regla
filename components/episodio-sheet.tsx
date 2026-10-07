"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/use-lilaila";
import { CHOICE_CLASS, choiceStyle } from "@/lib/choice";
import type { Reaccion } from "@/lib/lilita/reacciones";
import type { FaceMood } from "./lilita-face";
import {
  AVANCE_MS,
  Asa,
  BarraPasos,
  Celebra,
  DESLIZA_PX,
  ListaAsiQueda,
  PieAtras,
  PieBoton,
  PreguntaLilita,
  useSwipeToClose,
} from "./pasos";

/* ═══════════════════════════════════════════════════════════════
   PAS Y COOKIE MONSTER, POR PASOS

   Igual que la hoja del día: una pregunta cada vez, Lilita
   contestando, la barra de tramos arriba y al final la lista «así
   queda» con cada fila tocable.

   Lo de siempre sigue siendo verdad: el toque del botón ya ha
   guardado el episodio antes de que se abra esto. Las preguntas son
   para completar, y cerrar a medias no pierde nada: cada respuesta
   se escribe al tocarla.
   ═══════════════════════════════════════════════════════════════ */

export interface PasoEpisodio {
  id: string;
  /** Para la barra y para la lista del final */
  nombre: string;
  titulo: string;
  ayuda?: string;
  hecho: boolean;
  /** Lo contestado, en palabras, para la lista del final */
  valor?: string;
  /** Respuesta libre (la nota): no avanza sola, el pie dice «Seguir». */
  libre?: boolean;
  /** `contestada(r)`: Lilita reacciona y, con r, pasa a la siguiente. */
  render: (contestada: (r: Reaccion | null) => void) => ReactNode;
}

const LISTA = "lista";

export function EpisodioSheet({
  abierta,
  label,
  titulo,
  subtitulo,
  cara,
  pasos,
  celebra,
  aviso,
  onDeshacer,
  onCerrar,
}: {
  abierta: boolean;
  label: string;
  titulo: ReactNode;
  subtitulo: ReactNode;
  /** La cara con la que Lilita pregunta en este episodio */
  cara: FaceMood;
  pasos: PasoEpisodio[];
  /** Lo que dice Lilita al llegar a la lista contestando de corrido */
  celebra: string;
  /** Letra pequeña debajo de la lista */
  aviso?: ReactNode;
  onDeshacer: () => void;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const avance = useRef<number | undefined>(undefined);
  const toque = useRef<{ x: number; y: number } | null>(null);

  const [paso, setPaso] = useState<string>(pasos[0]?.id ?? LISTA);
  const [volver, setVolver] = useState(false);
  const [reaccion, setReaccion] = useState<Reaccion | null>(null);
  const [sentido, setSentido] = useState<0 | 1 | -1>(0);
  const [terminado, setTerminado] = useState(false);

  // Cada vez que se abre, desde la primera pregunta y sin restos de
  // la vez anterior. Ajustado durante el render, como en la hoja del día.
  const [estabaAbierta, setEstabaAbierta] = useState(abierta);
  if (abierta !== estabaAbierta) {
    setEstabaAbierta(abierta);
    if (abierta) {
      setPaso(pasos[0]?.id ?? LISTA);
      setVolver(false);
      setReaccion(null);
      setSentido(0);
      setTerminado(false);
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (abierta && !el.open) {
      el.showModal();
      panel.current?.focus({ preventScroll: true });
    }
    if (!abierta && el.open) el.close();
  }, [abierta]);

  useEffect(() => () => window.clearTimeout(avance.current), []);
  useSwipeToClose(panel, abierta, () => ref.current?.close());

  const orden = [...pasos.map((p) => p.id), LISTA];
  const indice = orden.indexOf(paso);
  const actual = pasos.find((p) => p.id === paso);

  function irA(id: string, hacia: 1 | -1 = 1) {
    window.clearTimeout(avance.current);
    setSentido(hacia);
    setReaccion(null);
    setTerminado(false);
    setPaso(id);
  }

  function siguiente() {
    if (volver) {
      setVolver(false);
      irA(LISTA);
      return;
    }
    const id = orden[Math.min(indice + 1, orden.length - 1)];
    irA(id);
    if (id === LISTA) setTerminado(true);
  }

  function atras() {
    if (volver) {
      setVolver(false);
      irA(LISTA, -1);
      return;
    }
    if (indice > 0) irA(orden[indice - 1], -1);
  }

  function contestada(r: Reaccion | null) {
    window.clearTimeout(avance.current);
    setReaccion(r);
    if (r) avance.current = window.setTimeout(siguiente, AVANCE_MS);
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={label}
      onClose={() => {
        window.clearTimeout(avance.current);
        onCerrar();
      }}
      // pointerdown y no click: ver la hoja del día.
      onPointerDown={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {abierta && (
        <div ref={panel} tabIndex={-1} className="sheet-panel flex flex-col outline-none">
          <div className="flex shrink-0 flex-col gap-xs px-lg pt-sm">
            <Asa />
            <header>
              <h2 className="font-display text-lg font-bold tracking-[-0.02em]">{titulo}</h2>
              <p className="text-xs text-faint" role="status">
                {subtitulo}
              </p>
            </header>
            <BarraPasos
              label={`Preguntas de ${label}`}
              tramos={orden.map((id) => {
                const p = pasos.find((x) => x.id === id);
                return {
                  id,
                  nombre: p?.nombre ?? "Así queda",
                  hecho: p?.hecho ?? false,
                  aqui: id === paso,
                };
              })}
              onIr={(id) => {
                setVolver(false);
                irA(id, orden.indexOf(id) < indice ? -1 : 1);
              }}
            />
          </div>

          <div
            data-sheet-body
            onTouchStart={(e) => {
              const t = e.touches[0];
              toque.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const ini = toque.current;
              toque.current = null;
              if (!ini || paso === LISTA) return;
              const t = e.changedTouches[0];
              const dx = t.clientX - ini.x;
              const dy = t.clientY - ini.y;
              if (Math.abs(dx) < DESLIZA_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
              haptic(6);
              if (dx < 0) siguiente();
              else atras();
            }}
            className="flex min-h-[300px] flex-1 flex-col gap-md overflow-y-auto overscroll-contain px-lg pt-xs pb-md"
          >
            <div
              key={paso}
              className={`${sentido === 1 ? "paso-in" : sentido === -1 ? "paso-in-atras" : ""} flex flex-col gap-md`}
            >
              {actual ? (
                <>
                  <PreguntaLilita
                    titulo={actual.titulo}
                    ayuda={actual.ayuda}
                    reaccion={reaccion}
                    cara={cara}
                  />
                  <Contenido paso={actual} contestada={contestada} />
                </>
              ) : (
                <>
                  <h3 className="sr-only">Así queda</h3>
                  {terminado && <Celebra texto={celebra} cara={cara === "enfadada" ? "gremlin" : "cuidando"} />}
                  <ListaAsiQueda
                    filas={pasos.map((p) => ({ id: p.id, nombre: p.nombre, valor: p.valor }))}
                    onEditar={(id) => {
                      haptic(8);
                      setVolver(true);
                      irA(id);
                    }}
                  />
                  {aviso && <p className="text-center text-xs text-faint">{aviso}</p>}
                </>
              )}
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-md border-t border-line px-lg pt-sm"
            style={{ paddingBottom: "calc(var(--spacing-sm) + env(safe-area-inset-bottom))" }}
          >
            {actual && (indice > 0 || volver) ? (
              <PieAtras onClick={atras}>{volver ? "Lista" : "Atrás"}</PieAtras>
            ) : (
              /* En la primera pregunta y en la lista, a la izquierda
                 va «Deshacer»: si fue sin querer, se borra y listo. */
              <button
                type="button"
                onClick={() => {
                  haptic(6);
                  onDeshacer();
                  ref.current?.close();
                }}
                className="min-h-[46px] pr-2 text-sm font-semibold underline underline-offset-2"
                style={{ color: "var(--fg-muted)" }}
              >
                Deshacer
              </button>
            )}
            <span className="flex-1" />
            {actual ? (
              <PieBoton
                fuerte={actual.hecho || volver}
                onClick={() => {
                  haptic(8);
                  siguiente();
                }}
              >
                {volver ? "Hecho" : actual.hecho ? "Seguir" : actual.libre ? "Nada más" : "Saltar"}
              </PieBoton>
            ) : (
              <PieBoton fuerte onClick={() => ref.current?.close()}>
                Listo
              </PieBoton>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

/** Pinta la pregunta. Aparte para que `contestada` le llegue como
    prop, igual que cualquier manejador de eventos. */
function Contenido({
  paso,
  contestada,
}: {
  paso: PasoEpisodio;
  contestada: (r: Reaccion | null) => void;
}) {
  return <>{paso.render(contestada)}</>;
}

/** Opciones de una sola respuesta, en grande, como en la hoja del día.
    Tocar la marcada la desmarca. */
export function UnaOpcion<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    // Con más de tres, en dos columnas: siete botones uno debajo de
    // otro no caben y la hoja acabaría desplazándose.
    <div
      role="group"
      aria-label={label}
      className={options.length > 3 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => {
              haptic(on ? 6 : 14);
              onChange(on ? undefined : o.value);
            }}
            className={`min-h-[52px] rounded-2xl text-left leading-tight ${options.length > 3 ? "px-md text-[15px]" : "px-lg text-base"} ${CHOICE_CLASS}`}
            style={choiceStyle(on)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** La nota: se guarda mientras escribe, no hace falta darle a nada. */
export function NotaLibre({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      id={id}
      aria-label="Nota"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={300}
      rows={3}
      placeholder={placeholder}
      className="w-full resize-none rounded-xl px-3 py-2.5 text-base outline-none field-sizing-content"
      style={{ background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--border)" }}
    />
  );
}

