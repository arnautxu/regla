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

const VERSION = "v4";
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
  url.pathname === "/manifest.webmanifest" ||
  url.pathname === "/cookie-monster.webmanifest";

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(request, copy));
          }
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
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
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

  event.waitUntil((async () => {
    // Account-bound pushes never reveal another account's content after logout.
    const allowed = !aviso.recipientId || await isCurrentAccount(aviso.recipientId);
    if (allowed && aviso.registro?.tipo === "respuesta-monstruo") {
      await apuntarRespuesta(aviso.registro.kind, aviso.ownerId).catch(() => {});
    }
    await self.registration.showNotification(allowed ? (aviso.title || "Lilaila") : "Lilaila", {
      body: allowed ? (aviso.body || "Tienes algo que apuntar.") : "Tienes un aviso. Entra en tu cuenta para verlo.",
      tag: `${aviso.ownerId || "legacy"}:${aviso.tag || "lilaila"}`,
      icon: "/icon-192.png", badge: "/icon-192.png",
      data: { url: aviso.url || "/", ownerId: aviso.ownerId, recipientId: aviso.recipientId },
      actions: allowed ? (aviso.actions || []) : [],
    });
  })());
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

async function isCurrentAccount(id) {
  try {
    const r = await fetch("/api/auth", { credentials: "include", cache: "no-store" });
    return r.ok && (await r.json()).user?.id === id;
  } catch { return false; }
}

function abrirDb(ownerId) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ownerId ? `lilaila-account-${ownerId}` : DB_NAME);
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

async function marcarPastilla(ownerId) {
  if (ownerId && !await isCurrentAccount(ownerId)) throw new Error("Cuenta distinta");
  const db = await abrirDb(ownerId);
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

const RESPUESTAS = ["animos", "pulla", "mensaje"];

async function apuntarRespuesta(kind, ownerId) {
  if (!RESPUESTAS.includes(kind)) return null;
  const db = await abrirDb(ownerId);
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
      const dia = previo.result || {};
      store.put({
        ...dia,
        date,
        monsterReplies: [...(dia.monsterReplies || []), { at: stamp, kind }],
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
      marcarPastilla(event.notification.data?.ownerId)
        .then((res) =>
          res ? avisarAClientes({ type: "pastilla-tomada", ownerId: event.notification.data?.ownerId, ...res }) : null,
        )
        // Si escribir falla, no se traga el toque en silencio: se abre
        // la app para que pueda marcarla a mano.
        .catch(() => abrirApp(url)),
    );
    return;
  }

  event.waitUntil(abrirApp(url));
});
