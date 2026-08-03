import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Schibsted_Grotesk } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

/* Bricolage Grotesque: grotesca deliberadamente descuadrada, con
   anchos que no acaban de cuadrar. Es el rótulo pintado a mano, el
   fanzine fotocopiado. Nada que ver con el pastel del sector. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

/* Schibsted Grotesk: cara de prensa noruega. Aguanta 15px con un ojo
   llorando a las tres de la mañana, que es el caso de uso real. */
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lilaila",
  description: "El ciclo de Lídia, con Lilita de testigo.",
  manifest: "/manifest.webmanifest",
  applicationName: "Lilaila",
  appleWebApp: {
    capable: true,
    title: "Lilaila",
    // "default" = barra clara con texto oscuro. El tema canónico es
    // claro, así que es lo correcto de fondo; AppShell la cambia a
    // "black-translucent" cuando el tema resuelto es oscuro. Con
    // "black-translucent" fijo aquí, la hora y la batería quedaban en
    // blanco sobre el papel claro — invisibles. Eso solo se ve en la
    // PWA instalada en iOS, nunca en un navegador de escritorio.
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false, date: false, email: false },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin maximumScale ni userScalable: bloquear el zoom rompe la
  // accesibilidad, y esta app se lee con dolor de cabeza.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1214" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      data-theme="light"
      data-phase="menstrual"
      className={`${bricolage.variable} ${schibsted.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
