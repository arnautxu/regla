"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/use-lilaila";
import { motion } from "motion/react";
import { Lilita } from "./lilita";

/* Iconos dibujados a mano, con el mismo grosor de trazo que Lilita.
   Nada de librería: un set genérico delata la plantilla al instante. */

const TABS = [
  {
    href: "/",
    label: "Hoy",
    icon: "M12 3.5c0 0 6.5 7.6 6.5 11.2a6.5 6.5 0 1 1-13 0C5.5 11.1 12 3.5 12 3.5z",
    fill: true,
  },
  {
    href: "/calendario",
    label: "Calendario",
    icon: "M4.5 6.5h15v13h-15zM4.5 10.5h15M9 3.5v4M15 3.5v4",
  },
  {
    href: "/historial",
    label: "Historial",
    icon: "M4 17.5l4.2-6.2 3.6 2.8 4-7.4 4.2 5",
  },
  {
    href: "/ajustes",
    label: "Ajustes",
    icon: "M4 8h16M4 16h16",
    knobs: [
      [9, 8],
      [15, 16],
    ],
  },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones"
      className="sticky bottom-0 z-40 border-t border-line bg-bg pb-safe"
    >
      {/* Cinco huecos: las cuatro secciones y, en medio, Lilita. El
          chat estaba escondido detrás de la tarjeta de Hoy; ahora se
          llega a ella desde cualquier pantalla con el pulgar. */}
      <ul className="grid grid-cols-5">
        {[...TABS.slice(0, 2), null, ...TABS.slice(2)].map((tab) => {
          if (!tab) {
            const enChat = pathname.startsWith("/chat");
            /* El hueco mide lo mismo que las demás pestañas y la
               etiqueta cae en la misma línea que las otras; solo el
               botón redondo sobresale por encima de la barra. Antes
               era el hueco entero el que subía, y la etiqueta y el
               círculo quedaban descolocados respecto al resto. */
            return (
              <li key="lilita" className="relative">
                <Link
                  href="/chat"
                  onClick={() => haptic(10)}
                  aria-label="Hablar con Lilita"
                  aria-current={enChat ? "page" : undefined}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-1 pt-2 pb-1"
                >
                  <motion.span
                    whileTap={{ scale: 0.88, y: 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="absolute left-1/2 -top-6 -ml-7 flex size-14 items-center justify-center rounded-full"
                    style={{
                      background: "radial-gradient(circle at 35% 30%, var(--accent-soft), var(--surface) 75%)",
                      // Un aro del color del fondo lo separa de la barra,
                      // y detrás la sombra dura de pegatina de toda la app.
                      boxShadow: `inset 0 0 0 ${enChat ? 2.5 : 2}px var(--accent), 0 0 0 4px var(--bg), 3px 3px 0 4px var(--depth-shadow)`,
                    }}
                  >
                    <span className="mt-0.5">
                      <Lilita mood={enChat ? "energica" : "neutral"} size={34} />
                    </span>
                  </motion.span>
                  {/* Ocupa el sitio del icono de las otras pestañas,
                      para que "Lilita" caiga en la misma línea. */}
                  <span aria-hidden="true" className="size-6" />
                  <span
                    className="text-2xs tracking-wide"
                    style={{ color: "var(--accent)", fontWeight: enChat ? 700 : 600 }}
                  >
                    Lilita
                  </span>
                </Link>
              </li>
            );
          }
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                onClick={() => haptic(8)}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[56px] flex-col items-center justify-center gap-1 pt-2 pb-1 transition-colors duration-150"
                style={{ color: active ? "var(--accent)" : "var(--fg-faint)" }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.4 : 1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d={tab.icon}
                    fill={"fill" in tab && tab.fill && active ? "currentColor" : "none"}
                  />
                  {"knobs" in tab &&
                    tab.knobs?.map(([cx, cy]) => (
                      <circle
                        key={`${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r="2.6"
                        fill="var(--bg)"
                      />
                    ))}
                </svg>
                <span
                  className="text-2xs tracking-wide"
                  style={{ fontWeight: active ? 600 : 450 }}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
