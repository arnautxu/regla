/* ═══════════════════════════════════════════════════════════════
   Service worker de Lilaila.

   No se precachea una lista fija de ficheros: los bundles de Next
   llevan hash y esa lista caduca en cada despliegue. En vez de eso,
   dos estrategias en caliente:

     · navegaciones  → red primero, caché si no hay red
     · estáticos     → caché primero (van con hash, son inmutables)

   Resultado: la primera visita necesita red; a partir de ahí abre
   sin cobertura, que es el caso real — el metro, el avión, el pueblo.

   Los datos del ciclo NO pasan por aquí. Viven en IndexedDB y no
   salen del dispositivo ni siquiera hacia esta caché.
   ═══════════════════════════════════════════════════════════════ */

const VERSION = "v1";
const PAGES = `lilaila-pages-${VERSION}`;
const ASSETS = `lilaila-assets-${VERSION}`;
const KEEP = [PAGES, ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(["/", "/calendario", "/historial", "/ajustes"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icon") ||
  url.pathname === "/apple-touch-icon.png" ||
  url.pathname === "/manifest.webmanifest";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ??
            (await caches.match("/")) ??
            new Response("Sin conexión y sin caché todavía.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
