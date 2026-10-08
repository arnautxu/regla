"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { pushNow, startBackup, stopBackup } from "@/lib/backup";
import { traerDiarioAnterior } from "@/lib/diario-anterior";
import { CUENTAS_ACTIVAS, DEMO, comprobarSesion } from "@/lib/cuenta";
import { Acceso } from "./cuenta";
import { Lilita } from "./lilita";

export const OWNER_KEY = "lilaila-account-owner";
export function AccountGate({ children }: { children: React.ReactNode }) {
  if (!CUENTAS_ACTIVAS) return children;
  return <Gate>{children}</Gate>;
}

/**
 * La cuenta es obligatoria: sin sesión no hay diario. Cada cuenta tiene
 * su propia base de datos en el móvil, así que cambiar de cuenta
 * recarga la app antes de montar nada.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "login" | "ready">("loading");
  // El móvil de la pareja entra directo, sin la bienvenida de la dueña del ciclo.
  const pareja = usePathname() === "/cookie-monster";
  useEffect(() => {
    let alive = true;
    const changed = (event: StorageEvent) => { if (event.key === OWNER_KEY) location.reload(); };
    window.addEventListener("storage", changed);
    comprobarSesion().then(async d => {
      if (!alive) return;
      if (DEMO) { setStatus(d.authenticated ? "ready" : "login"); return; }
      const owner = d.user?.id ?? "guest";
      if ((localStorage.getItem(OWNER_KEY) ?? "guest") !== owner) {
        stopBackup(); localStorage.setItem(OWNER_KEY, owner); location.reload(); return;
      }
      if (d.authenticated) {
        await startBackup();
        // Después de mirar la copia: si allí había diario, ya está aquí y no se toca.
        if (await traerDiarioAnterior().catch(() => false)) await pushNow().catch(() => {});
        if (alive) setStatus("ready");
      }
      else setStatus("login");
    }).catch(() => {
      // Sin red: quien ya entró en este móvil sigue con su diario local.
      if (alive) setStatus((localStorage.getItem(OWNER_KEY) ?? "guest") !== "guest" || DEMO ? "ready" : "login");
    });
    return () => { alive = false; stopBackup(); window.removeEventListener("storage", changed); };
  }, []);
  if (status === "loading") return <div className="flex min-h-dvh items-center justify-center"><Lilita mood="dormida" size={100} /></div>;
  if (status === "ready") return children;
  return <Acceso directa={pareja} onDentro={() => location.reload()} />;
}
