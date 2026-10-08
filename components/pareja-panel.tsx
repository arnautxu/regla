"use client";

import { useState } from "react";
import { Lilita } from "./lilita";
import { accountMode } from "@/lib/account-mode";
import { updateSettings, type Settings } from "@/lib/db";
import { esMenor, nombrePareja } from "@/lib/pareja";
import { haptic } from "@/lib/use-lilaila";

/* ═══════════════════════════════════════════════════════════════
   TU PAREJA

   Con 18 o más: el nombre (lo usa Lilita y Cookie Monster), la
   invitación para que le lleguen los avisos y quitarla. Con menos,
   el grupo sale cerrado: ni nombre, ni avisos, ni Cookie Monster.
   ═══════════════════════════════════════════════════════════════ */

export function ParejaPanel({ settings }: { settings: Settings }) {
  const menor = esMenor(settings);
  const pareja = nombrePareja(settings);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [invitacion, setInvitacion] = useState("");
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState("");

  async function llamar(method: "POST" | "DELETE") {
    setOcupada(true);
    setAviso("");
    try {
      const r = await fetch("/api/partner", { method, headers: { "Content-Type": "application/json" } });
      const d = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "No se ha podido completar.");
      return d;
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Sin conexión.");
      return null;
    } finally {
      setOcupada(false);
    }
  }

  function guardar() {
    const n = nombre.trim();
    setEditando(false);
    if (!n) return;
    haptic(10);
    void updateSettings({ partnerName: n });
  }

  if (menor) {
    return (
      <Group title="Tu pareja">
        <div className="flex items-center gap-3 py-3.5">
          <Lilita mood="cuidando" size={52} className="shrink-0" />
          <p className="text-sm text-muted">
            Esto se abre cuando cumplas 18. Mientras, lo tuyo es tuyo y de nadie más.
          </p>
        </div>
      </Group>
    );
  }

  return (
    <Group title="Tu pareja" note={pareja ? "Le llegan los avisos que tú decidas. Nunca ve tu diario." : undefined}>
      {editando ? (
        <form
          className="flex min-h-[56px] items-center gap-2 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value.slice(0, 40))}
            onBlur={guardar}
            placeholder="Su nombre"
            aria-label="Nombre de tu pareja"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          <button type="submit" className="text-sm font-bold text-accent">
            Listo
          </button>
        </form>
      ) : (
        <Row
          label={pareja ? "Nombre" : "Añadir pareja"}
          hint={pareja ? undefined : "Solo el nombre, para que Lilita sepa a quién culpar"}
          value={pareja ?? undefined}
          onClick={() => {
            haptic(8);
            setNombre(pareja ?? "");
            setEditando(true);
          }}
        />
      )}

      {pareja && accountMode() && (
        <Row
          label="Cookie Monster"
          hint={invitacion ? undefined : `Para que a ${pareja} le lleguen tus avisos`}
          value="Invitar"
          onClick={() => {
            if (ocupada) return;
            haptic(10);
            void llamar("POST").then((d) => d?.token && setInvitacion(d.token));
          }}
        />
      )}
      {invitacion && (
        <div className="py-3">
          <p className="break-all rounded-xl p-3 font-mono text-sm" style={{ background: "var(--bg)" }}>
            {invitacion}
          </p>
          <p className="mt-2 text-xs text-muted">
            Sirve una hora. {pareja} entra con su correo en /cookie-monster y lo escribe ahí.
          </p>
        </div>
      )}

      {pareja && (
        <Row
          label="Quitar pareja"
          hint="Lilita deja de nombrarle y deja de recibir avisos"
          danger
          onClick={() => {
            if (!window.confirm(`¿Quito a ${pareja}? Dejará de recibir tus avisos.`)) return;
            haptic(10);
            setInvitacion("");
            const quitar = () => void updateSettings({ partnerName: null });
            if (accountMode()) void llamar("DELETE").then((d) => d && quitar());
            else quitar();
          }}
        />
      )}
      {aviso && (
        <p role="alert" className="pb-3 text-sm" style={{ color: "var(--accent)" }}>
          {aviso}
        </p>
      )}
    </Group>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.14em] text-faint">{title}</h2>
      <div className="sticker mt-sm divide-y divide-[var(--border)] rounded-2xl px-lg" style={{ background: "var(--surface)" }}>
        {children}
      </div>
      {note && <p className="mt-sm text-xs leading-relaxed text-faint">{note}</p>}
    </section>
  );
}

function Row({
  label,
  hint,
  value,
  danger,
  onClick,
}: {
  label: string;
  hint?: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[56px] w-full items-center justify-between gap-md py-3 text-left"
    >
      <span className="min-w-0">
        <span
          className="block text-base"
          style={{ color: danger ? "var(--accent)" : "var(--fg)", fontWeight: danger ? 600 : 400 }}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
      </span>
      {value ? <span className="shrink-0 truncate text-sm text-muted">{value}</span> : <span className="text-faint">›</span>}
    </button>
  );
}
