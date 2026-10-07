"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { haptic } from "@/lib/use-lilaila";
import { LilitaFace, type FaceMood } from "./lilita-face";
import type { Reaccion } from "@/lib/lilita/reacciones";

/* ═══════════════════════════════════════════════════════════════
   LAS PIEZAS DE «UNA PREGUNTA CADA VEZ»

   La hoja del día fue la primera en ir por pasos. Ahora PAS y
   Cookie Monster van igual, así que lo que las tres comparten vive
   aquí: arrastrar para cerrar, la barra de tramos, Lilita haciendo
   la pregunta, el botón del pie y la lista del final. Si una cambia
   de aspecto, cambian las tres.
   ═══════════════════════════════════════════════════════════════ */

/** Lo que tarda en pasar a la siguiente pregunta tras un toque: lo
    justo para ver el botón encenderse y leer lo que contesta Lilita. */
export const AVANCE_MS = 750;

/** Lo que tiene que recorrer el dedo de lado para cambiar de pregunta. */
export const DESLIZA_PX = 60;

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

export function useSwipeToClose(
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

/** La rayita de arriba de la hoja: promete que se puede bajar. */
export function Asa() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto h-1 w-10 rounded-full"
      style={{ background: "var(--border-strong)" }}
    />
  );
}

/* Por dónde vas: un tramo por pregunta, cuadrados y con huecos finos
   como el anillo de Hoy. Relleno = ya contestada. Cada tramo se toca
   para saltar ahí. */
export function BarraPasos({
  label,
  tramos,
  onIr,
}: {
  label: string;
  tramos: { id: string; nombre: string; hecho: boolean; aqui: boolean }[];
  onIr: (id: string) => void;
}) {
  return (
    <nav aria-label={label} className="-mx-1 flex">
      {tramos.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={t.nombre}
          aria-current={t.aqui ? "step" : undefined}
          onClick={() => {
            haptic(6);
            onIr(t.id);
          }}
          className="flex flex-1 items-center px-px py-2"
        >
          <span
            className="h-1.5 w-full transition-colors duration-200"
            style={{
              background: t.aqui ? "var(--fg)" : t.hecho ? "var(--accent)" : "var(--border)",
            }}
          />
        </button>
      ))}
    </nav>
  );
}

/** Lilita hace la pregunta, y contesta a lo que marcas: la cara
    cambia y la frase de ayuda deja paso a la suya. */
export function PreguntaLilita({
  titulo,
  ayuda,
  reaccion,
  cara = "neutral",
}: {
  titulo: string;
  ayuda?: string;
  reaccion: Reaccion | null;
  /** La cara con la que pregunta, antes de que le contesten. */
  cara?: FaceMood;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 pt-0.5">
        <LilitaFace mood={reaccion?.cara ?? cara} size={52} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-balance font-display text-2xl font-bold leading-[1.1] tracking-[-0.02em]">
          {titulo}
        </h3>
        <p
          key={reaccion?.texto ?? "ayuda"}
          aria-live="polite"
          className={`mt-1 min-h-[1.25rem] text-sm ${reaccion ? "reaccion-in font-semibold" : "text-muted"}`}
          style={reaccion ? { color: "var(--accent)" } : undefined}
        >
          {reaccion?.texto ?? ayuda ?? ""}
        </p>
      </div>
    </div>
  );
}

/** Lilita celebra que se ha llegado a la lista contestando de corrido. */
export function Celebra({ texto, cara = "energica" }: { texto: string; cara?: FaceMood }) {
  return (
    <div className="flex items-center gap-3">
      <LilitaFace mood={cara} size={44} />
      <p className="reaccion-in font-display text-base font-bold leading-tight">{texto}</p>
    </div>
  );
}

export function PieBoton({
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

/** El botón de texto de la izquierda del pie: «Atrás», «Lista»… */
export function PieAtras({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic(6);
        onClick();
      }}
      disabled={disabled}
      className="flex min-h-[46px] items-center gap-1 pr-2 text-sm font-semibold disabled:opacity-0"
      style={{ color: "var(--fg-muted)" }}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 5 L8 12 L14.5 19" />
      </svg>
      {children}
    </button>
  );
}

/* ── La lista del final ─────────────────────────────────────────
   Una fila por pregunta, con lo apuntado en palabras. Lo que falta
   se dice ("Sin contestar") en vez de esconderse: así se ve de un
   vistazo qué queda, y tocarlo lleva directo a esa pregunta. */
export function ListaAsiQueda({
  filas,
  onEditar,
}: {
  filas: { id: string; nombre: string; valor: string | undefined }[];
  onEditar: (id: string) => void;
}) {
  return (
    <ul className="-mt-2 flex flex-col">
      {filas.map(({ id, nombre, valor: v }) => (
        <li key={id} className="border-b border-line last:border-b-0">
          <button
            type="button"
            onClick={() => onEditar(id)}
            className="flex w-full items-center gap-md py-2.5 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                {nombre}
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
      ))}
    </ul>
  );
}
