import type { CapacitorConfig } from "@capacitor/cli";

/* La app de la App Store es la misma web de Vercel dentro de un
   contenedor nativo: tiene rutas de servidor (chat, voz, avisos) y no
   se puede exportar estática. server.url apunta a producción; para
   probar contra otra, CAP_SERVER_URL=https://… npx cap sync ios. */
const config: CapacitorConfig = {
  appId: "app.lilaila",
  appName: "Lilaila",
  webDir: "capacitor/www",
  server: {
    url: process.env.CAP_SERVER_URL ?? "https://lilaila.vercel.app",
    allowNavigation: ["*.supabase.co", "appleid.apple.com", "accounts.google.com"],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#fcfaf8",
  },
};

export default config;
