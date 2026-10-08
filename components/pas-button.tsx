"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  addCryEvent,
  removeCryEvent,
  toKey,
  updateCryEvent,
  type CryEvent,
  type CryReason,
} from "@/lib/db";
import { CRY_INTENSITIES, CRY_REASONS, labelOf } from "@/lib/labels";
import { haptic } from "@/lib/use-lilaila";
import { REACCION_PAS_INTENSIDAD, REACCION_PAS_MOTIVO } from "@/lib/lilita/reacciones";
import { EpisodioSheet, NotaLibre, UnaOpcion } from "./episodio-sheet";

/* ═══════════════════════════════════════════════════════════════
   PAS · HE LLORADO

   Guardar primero, preguntar después. Antes el botón abría un
   formulario que no dejaba guardar sin elegir motivo: llorando no
   apetece rellenar nada, y el PAS que no se apunta no existe para
   los patrones. Ahora un toque guarda hora, día y fase, y la hoja
   que se abre es para añadir lo que quiera, cuando quiera.

   La hoja va por pasos, como la del día: cómo de fuerte, qué lo
   provocó y si quiere contar algo, una pregunta cada vez y con
   Lilita al lado. Cada respuesta se guarda al tocarla; «Deshacer»
   lo borra si fue sin querer.

   Nada de esto sale del móvil: el PAS no entra en el chat de Lilita
   ni en la llamada.
   ═══════════════════════════════════════════════════════════════ */

export function PasButton({ pareja }: { pareja: string | null }) {
  const [event, setEvent] = useState<CryEvent | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");

  // La confirmación vive en el propio botón y se va sola.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  async function cry() {
    haptic([12, 35, 12]);
    const fresh: CryEvent = { id: crypto.randomUUID(), at: new Date().toISOString() };
    setError("");
    try {
      await addCryEvent(fresh);
      setEvent(fresh);
      setFlash(true);
      setAbierta(true);
    } catch {
      setError("No se ha podido guardar. Inténtalo otra vez.");
    }
  }

  function patch(p: Partial<Omit<CryEvent, "id" | "at">>) {
    if (!event) return;
    setEvent({ ...event, ...p });
    void updateCryEvent(toKey(new Date(event.at)), event.id, p).catch(() =>
      setError("No se ha podido guardar el cambio."),
    );
  }

  async function undo() {
    if (!event) return;
    await removeCryEvent(toKey(new Date(event.at)), event.id).catch(() => {});
    setFlash(false);
  }

  const intensidad = event?.intensity;
  const nota = event?.note ?? "";

  return (
    <>
      <button
        type="button"
        onClick={() => void cry()}
        className="flat quick-btn"
        style={{ background: "var(--surface)", color: flash ? "var(--ok)" : error ? "var(--accent)" : "var(--fg)" }}
      >
        <span aria-hidden="true" className="text-lg leading-none">{flash ? "✓" : "💧"}</span>
        <span role="status">{flash ? "PAS guardado" : error ? "No ha salido" : "He llorado"}</span>
      </button>

      <EpisodioSheet
        abierta={abierta && !!event}
        label="PAS"
        cara="llorando"
        titulo={event ? `💧 PAS a las ${format(new Date(event.at), "HH:mm")}` : ""}
        subtitulo={error || "Ya está guardado. Lo demás, solo si te apetece."}
        celebra="Apuntado. Y ahora, mimos."
        onDeshacer={() => void undo()}
        onCerrar={() => {
          setAbierta(false);
          // La nota se guarda sin espacios sobrantes al cerrar.
          if (event?.note !== undefined && event.note.trim() !== event.note) {
            patch({ note: event.note.trim() || undefined });
          }
        }}
        pasos={[
          {
            id: "fuerte",
            nombre: "Cómo de fuerte",
            titulo: "¿Cómo de fuerte?",
            ayuda: "Sin pensarlo mucho.",
            hecho: intensidad !== undefined,
            valor: labelOf(CRY_INTENSITIES, intensidad),
            render: (contestada) => (
              <UnaOpcion
                label="Cómo de fuerte"
                options={CRY_INTENSITIES}
                value={intensidad}
                onChange={(v) => {
                  patch({ intensity: v });
                  contestada(v === undefined ? null : REACCION_PAS_INTENSIDAD[v]);
                }}
              />
            ),
          },
          {
            id: "motivo",
            nombre: "Por qué",
            titulo: "¿Qué crees que lo provocó?",
            ayuda: "«No lo sé» también vale.",
            hecho: event?.reason !== undefined,
            valor: labelOf(CRY_REASONS, event?.reason),
            render: (contestada) => (
              <UnaOpcion
                label="Qué lo provocó"
                options={CRY_REASONS}
                value={event?.reason}
                onChange={(v: CryReason | undefined) => {
                  patch({ reason: v });
                  contestada(v === undefined ? null : REACCION_PAS_MOTIVO[v]);
                }}
              />
            ),
          },
          {
            id: "nota",
            nombre: "Nota",
            titulo: "¿Quieres contar algo más?",
            ayuda: pareja ? `Esto no se lo cuento a nadie, ni a ${pareja}.` : "Esto no se lo cuento a nadie.",
            hecho: !!nota.trim(),
            valor: nota.trim() || undefined,
            libre: true,
            render: () => (
              <NotaLibre
                id="pas-nota"
                value={nota}
                placeholder="Qué pasó, cómo te sentías…"
                onChange={(v) => patch({ note: v || undefined })}
              />
            ),
          },
        ]}
      />
    </>
  );
}
