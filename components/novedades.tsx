"use client";

import { useEffect, useRef, useState } from "react";
import { LilitaFace } from "./lilita-face";
import {
  marcarNovedadesVistas,
  novedadesPendientes,
  type Novedad,
} from "@/lib/novedades";

/**
 * La primera vez que se abre la app después de un despliegue con
 * novedades, Lilita las cuenta en una hoja. Sale una vez: al cerrarla
 * (con el botón, tocando fuera o con Escape) quedan como vistas.
 */
export function Novedades() {
  const ref = useRef<HTMLDialogElement>(null);
  // AppShell solo la monta cuando IndexedDB ya ha cargado (`ready`),
  // que nunca pasa en el servidor: leer localStorage aquí no rompe la
  // hidratación.
  const [pendientes, setPendientes] = useState<Novedad[]>(novedadesPendientes);

  useEffect(() => {
    if (pendientes.length > 0 && !ref.current?.open) ref.current?.showModal();
  }, [pendientes.length]);

  if (pendientes.length === 0) return null;

  return (
    <dialog
      ref={ref}
      onClose={() => {
        marcarNovedadesVistas();
        setPendientes([]);
      }}
      onPointerDown={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="sheet"
      aria-labelledby="novedades-titulo"
    >
      <div className="sheet-panel flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto px-lg pt-lg">
          <div className="flex items-center gap-md">
            <LilitaFace mood="energica" size={72} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">
                Novedades
              </p>
              <h2
                id="novedades-titulo"
                className="font-display text-lg font-bold leading-tight tracking-[-0.02em]"
              >
                {pendientes[0].titulo}
              </h2>
            </div>
          </div>

          {pendientes.map((n, i) => (
            <section key={n.id} className="flex flex-col gap-xs">
              {i > 0 && (
                <h3 className="font-display text-base font-bold tracking-[-0.01em]">
                  {n.titulo}
                </h3>
              )}
              <ul className="flex flex-col gap-sm">
                {n.cambios.map((c) => (
                  <li key={c} className="flex gap-sm text-sm leading-snug">
                    <span
                      aria-hidden="true"
                      className="mt-[0.45em] size-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          className="flex shrink-0 justify-end px-lg pt-md"
          style={{ paddingBottom: "calc(var(--spacing-md) + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-[46px] min-w-[120px] rounded-full px-xl font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
            style={{
              background: "var(--accent)",
              color: "var(--on-accent)",
              boxShadow: "3px 3px 0 0 var(--depth-shadow)",
            }}
          >
            Vale
          </button>
        </div>
      </div>
    </dialog>
  );
}
