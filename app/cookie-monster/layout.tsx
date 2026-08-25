import type { Metadata } from "next";

/* Esta página tiene su propio manifest: si se añade a Inicio desde aquí,
   el icono abre el receptor y no el diario de Lídia. */
export const metadata: Metadata = {
  manifest: "/cookie-monster.webmanifest",
  applicationName: "Cookie Monster",
  appleWebApp: { capable: true, title: "Cookie Monster", statusBarStyle: "default" },
};

export default function CookieMonsterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
