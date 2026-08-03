"use client";

import { useEffect, useRef, useState } from "react";
import { Lilita } from "./lilita";
import { startBackup } from "@/lib/backup";
import { haptic } from "@/lib/use-lilaila";

type Gate =
  | { state: "comprobando" }
  | { state: "sin-servidor" }
  | { state: "pide-pin"; error?: string }
  | { state: "dentro" };

export function PinGate({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>({ state: "comprobando" });
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d: { configured: boolean; authenticated: boolean }) => {
        if (!alive) return;
        if (!d.configured) return setGate({ state: "sin-servidor" });
        setGate(d.authenticated ? { state: "dentro" } : { state: "pide-pin" });
      })
      .catch(() => {
        // Sin red al arrancar: no la dejamos fuera de sus propios
        // datos. La app es local; la copia ya se pondrá al día.
        if (alive) setGate({ state: "sin-servidor" });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (gate.state === "dentro") void startBackup();
  }, [gate.state]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending || pin.length < 4) return;
    setSending(true);

    // Fallo de red y fallo del servidor son cosas distintas y hay que
    // decirlas distintas. Antes iban al mismo catch: un 500 con el
    // cuerpo vacío hacía reventar res.json() y se anunciaba como
    // "sin conexión", que mandaba a mirar el wifi durante media hora
    // mientras el problema era una variable de entorno.
    let res: Response;
    try {
      res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
    } catch {
      setSending(false);
      setGate({ state: "pide-pin", error: "Sin conexión ahora mismo." });
      return;
    }

    setSending(false);

    if (res.ok) {
      haptic([18, 40, 26]);
      setGate({ state: "dentro" });
      return;
    }

    // El cuerpo puede no ser JSON (un 500 crudo, una página de error
    // del proxy). Que eso no vuelva a disfrazarse de otra cosa.
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    haptic([40, 60, 40]);
    setPin("");
    input.current?.focus();
    setGate({
      state: "pide-pin",
      error:
        data.error ??
        (res.status >= 500
          ? `Error del servidor (${res.status}). Revisa la configuración.`
          : "No ha colado."),
    });
  }

  if (gate.state === "comprobando") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-lg">
        <Lilita mood="dormida" size={124} />
      </div>
    );
  }

  if (gate.state === "dentro" || gate.state === "sin-servidor") {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-xl px-safe pb-2xl">
      <div className="flex justify-center">
        <Lilita mood="neutral" size={140} />
      </div>

      <div>
        <h1 className="text-balance text-center font-display text-lg font-semibold leading-[1.2] tracking-[-0.02em]">
          Tu código, que aquí no entra cualquiera.
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          Guardo todo lo tuyo. Alguien tendrá que demostrar que eres tú.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-md">
        <input
          ref={input}
          autoFocus
          type="password"
          // Teclado numérico solo mientras lo que lleva escrito son
          // dígitos. Antes el campo FILTRABA a dígitos y cortaba en
          // 10, así que un código alfanumérico —que es más fuerte que
          // seis números— era literalmente imposible de teclear. La
          // app no tiene por qué dictar el formato de la contraseña.
          inputMode={/^\d*$/.test(pin) ? "numeric" : "text"}
          autoComplete="current-password"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.slice(0, 64));
            // El error del intento anterior se va en cuanto vuelve a
            // teclear. Dejarlo puesto mientras escribe el código bueno
            // la deja pensando que ya ha fallado otra vez.
            if (gate.error) setGate({ state: "pide-pin" });
          }}
          aria-label="Código de acceso"
          aria-invalid={Boolean(gate.error)}
          // El espaciado ancho es bonito para seis dígitos y un
          // desastre para un código alfanumérico largo: se sale de la
          // caja. Se adapta a lo que esté escribiendo.
          className={`tnum w-full rounded-2xl bg-transparent py-4 text-center font-display outline-none ${
            /^\d*$/.test(pin) && pin.length <= 8
              ? "text-2xl tracking-[0.4em]"
              : "text-lg tracking-[0.08em]"
          }`}
          style={{ boxShadow: "inset 0 0 0 1.5px var(--border-strong)" }}
        />

        {gate.error && (
          <p role="alert" className="text-center text-sm" style={{ color: "var(--accent)" }}>
            {gate.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pin.length < 4 || sending}
          className="w-full rounded-full px-lg py-4 font-display text-base font-bold transition-[transform,opacity] duration-150 active:scale-[0.975] disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          {sending ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
