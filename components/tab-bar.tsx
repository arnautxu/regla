"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/use-lilaila";
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
            return (
              <li key="lilita" className="flex justify-center">
                <Link
                  href="/chat"
                  onClick={() => haptic(10)}
                  aria-label="Hablar con Lilita"
                  className="-mt-5 flex flex-col items-center gap-1"
                >
                  <span
                    className="sticker-sm flex size-[52px] items-end justify-center overflow-hidden rounded-full"
                    style={{
                      background: "var(--accent-soft)",
                      boxShadow:
                        "inset 0 0 0 1.5px var(--accent), 2px 2px 0 0 var(--depth-shadow)",
                    }}
                  >
                    <span className="translate-y-[12px]">
                      <Lilita mood="neutral" size={32} />
                    </span>
                  </span>
                  <span className="text-2xs font-semibold tracking-wide" style={{ color: "var(--accent)" }}>
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
