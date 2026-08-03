"use client";

import { useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  pushNow,
  subscribeBackup,
  type BackupState,
} from "@/lib/backup";
import { exportBackup, importBackup, wipeEverything } from "@/lib/db";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   LA COPIA, A LA VISTA

   Existia y no se veia por ninguna parte: podia llevar dias fallando
   en silencio. Si el unico seguro contra perder dos años de registro
   no dice si funciona, no es un seguro, es fe.
   ═══════════════════════════════════════════════════════════════ */

function describe(s: BackupState): { text: string; alarm: boolean } {
  switch (s.status) {
    case "off":
      return {
        text: "Sin copia. Todo vive solo en este móvil.",
        alarm: false,
      };
    case "saving":
      return { text: "Guardando…", alarm: false };
    case "saved":
      return {
        text: `Guardada ${formatDistanceToNow(new Date(s.savedAt), {
          locale: es,
          addSuffix: true,
        })}`,
        alarm: false,
      };
    case "offline":
      return {
        text: s.savedAt
          ? `Sin conexión. La última fue ${formatDistanceToNow(new Date(s.savedAt), { locale: es, addSuffix: true })}.`
          : "Sin conexión. Se guardará cuando vuelva.",
        alarm: false,
      };
    case "error":
      return { text: s.message, alarm: true };
  }
}

export function BackupPanel() {
  const [state, setState] = useState<BackupState>({ status: "off" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const fichero = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeBackup(setState), []);

  const info = describe(state);

  async function exportar() {
    haptic(10);
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lilaila-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    // Sin revoke inmediato: en iOS la descarga es asincrona y liberar
    // la URL antes de tiempo deja el fichero vacio.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setAviso("Guardado. Mételo en algún sitio que no sea este móvil.");
  }

  async function importar(file: File) {
    // Los dos fallos se cuentan distinto. Un JSON roto lanzaba su
    // SyntaxError tal cual —"Unexpected token 'e'…"— que a ella no le
    // dice nada. El de validación sí está escrito para leerse.
    let datos: unknown;
    try {
      datos = JSON.parse(await file.text());
    } catch {
      setAviso("Ese fichero está roto o no es un JSON. Prueba con otro.");
      return;
    }

    try {
      await importBackup(datos);
      haptic([18, 40, 26]);
      setAviso("Restaurado. Tus datos vuelven a estar aquí.");
      void pushNow();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Ese fichero no vale.");
    }
  }

  return (
    <section
      className="sticker flex flex-col gap-md rounded-2xl px-lg py-md"
      style={{ background: "var(--surface)" }}
    >
      <div>
        <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          Copia de seguridad
        </h2>
        <p
          className="mt-1.5 text-sm"
          style={{ color: info.alarm ? "var(--accent)" : "var(--fg-muted)" }}
          role={info.alarm ? "alert" : undefined}
        >
          {info.text}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {state.status !== "off" && (
          <Boton
            onClick={() => {
              haptic(10);
              void pushNow();
            }}
            disabled={state.status === "saving"}
          >
            Guardar ahora
          </Boton>
        )}
        <Boton onClick={() => void exportar()}>Exportar a un fichero</Boton>
        <Boton onClick={() => fichero.current?.click()}>Restaurar</Boton>
      </div>

      <input
        ref={fichero}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importar(f);
          e.target.value = "";
        }}
      />

      {aviso && (
        <p className="text-xs leading-relaxed text-muted" role="status">
          {aviso}
        </p>
      )}

      <p className="text-xs leading-relaxed text-faint">
        El fichero exportado lleva todo tu historial en claro. Guárdalo donde
        guardarías una foto tuya, no en un grupo de WhatsApp.
      </p>

      {/* Borrar todo va al final, separado y con doble confirmación:
          es la única acción de esta app que no tiene vuelta atrás. */}
      <div className="mt-sm border-t border-line pt-md">
        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="flex min-h-[44px] items-center text-xs text-faint underline underline-offset-4"
          >
            Borrar todos mis datos
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: "var(--accent)" }}>
              Esto borra todo y no se puede deshacer. ¿Seguro?
            </p>
            <div className="flex gap-2">
              <Boton
                onClick={() => {
                  haptic([40, 60, 40]);
                  void wipeEverything().then(() => {
                    setConfirmando(false);
                    setAviso("Borrado. Empezamos de cero.");
                  });
                }}
                danger
              >
                Sí, borrar todo
              </Boton>
              <Boton onClick={() => setConfirmando(false)}>Cancelar</Boton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Boton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[44px] rounded-full px-4 text-sm transition-[transform,opacity,box-shadow] duration-150 active:scale-[0.97] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40"
      style={
        danger
          ? {
              background: "var(--accent)",
              color: "var(--on-accent)",
              boxShadow: "2px 2px 0 0 var(--depth-shadow)",
            }
          : {
              background: "var(--bg)",
              boxShadow: "var(--depth-sm)",
              color: "var(--fg-muted)",
            }
      }
    >
      {children}
    </button>
  );
}
