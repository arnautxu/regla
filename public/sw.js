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

   Con una excepción, al final del fichero: el aviso de la pastilla
   escribe en IndexedDB desde aquí. Es a propósito — a las diez de la
   noche la app está cerrada, y si marcar la pastilla necesitara
   abrirla, el aviso serviría para acordarse pero no para registrar.
   ═══════════════════════════════════════════════════════════════ */

const VERSION = "v2";
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

/* ═══════════════════════════════════════════════════════════════
   AVISOS

   El servidor manda un JSON con el texto ya escrito. Aquí no se
   decide nada del contenido: este fichero se cachea agresivamente en
   el móvil y podría llevar semanas sin actualizarse.
   ═══════════════════════════════════════════════════════════════ */

self.addEventListener("push", (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    // Un push sin cuerpo o con basura no se descarta: en iOS, un push
    // recibido que no acaba en showNotification cuenta como abuso y el
    // sistema termina revocando el permiso. Mejor un aviso genérico.
  }

  const title = aviso.title || "Lilaila";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: aviso.body || "Tienes algo que apuntar.",
      tag: aviso.tag || "lilaila",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: aviso.url || "/" },
      // iOS todavía ignora los botones de acción; ahí el aviso entero
      // es el botón y lleva a Hoy, donde la pastilla es lo primero que
      // se ve. En Android y escritorio sí salen y se marca sin abrir.
      actions: aviso.actions || [],
    }),
  );
});

/* --- La base de datos, desde aquí -------------------------------
   Es la misma IndexedDB que usa Dexie en la app: base "lilaila",
   almacén "days", clave primaria "date". Se escribe a pelo porque un
   service worker no puede cargar el bundle de la app.

   Se abre SIN número de versión a propósito: pedir una versión
   dispararía una migración desde aquí, y la que manda es la de la
   app. Si la base todavía no existe (nunca se abrió la app en este
   móvil) no hay nada que marcar y se sale sin tocar nada. */

const DB_NAME = "lilaila";
const STORE = "days";

function abrirDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("base bloqueada"));
  });
}

/** 'YYYY-MM-DD' en hora local, igual que toKey() en la app. */
function claveDeHoy(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function marcarPastilla() {
  const db = await abrirDb();
  if (!db.objectStoreNames.contains(STORE)) {
    db.close();
    return null;
  }

  const date = claveDeHoy();
  const stamp = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const previo = store.get(date);
    previo.onsuccess = () => {
      // Se fusiona con lo que hubiera: ese día puede tener ya flujo,
      // ánimo o una nota, y un put es un reemplazo entero.
      store.put({
        ...(previo.result || {}),
        date,
        pill: true,
        pillAt: stamp,
        updatedAt: stamp,
      });
    };
    tx.oncomplete = () => {
      db.close();
      resolve({ date, at: stamp });
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Si la app está abierta, que se entere: Dexie no ve este escritura. */
async function avisarAClientes(msg) {
  const clientes = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const c of clientes) c.postMessage(msg);
}

async function abrirApp(url) {
  const clientes = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  // Reutilizar la ventana que ya hay antes que abrir otra: si no, cada
  // aviso deja una pestaña más de la PWA por el camino.
  for (const c of clientes) {
    if ("focus" in c) {
      if ("navigate" in c && new URL(c.url).pathname !== url) {
        await c.navigate(url).catch(() => {});
      }
      return c.focus();
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url || "/";
  event.notification.close();

  if (event.action === "pastilla-tomada") {
    event.waitUntil(
      marcarPastilla()
        .then((res) =>
          res ? avisarAClientes({ type: "pastilla-tomada", ...res }) : null,
        )
        // Si escribir falla, no se traga el toque en silencio: se abre
        // la app para que pueda marcarla a mano.
        .catch(() => abrirApp(url)),
    );
    return;
  }

  event.waitUntil(abrirApp(url));
});
