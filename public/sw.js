// Cambiare questo nome fa rimuovere le cache precedenti all'attivazione.
const CACHE = "lanterne-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Il contenuto di una notifica arriva dalla rete: si apre solo un percorso di questa app.
function internalPath(url) {
  if (typeof url !== "string") return "/";
  try {
    const target = new URL(url, self.location.origin);
    if (target.origin === self.location.origin) return target.pathname + target.search;
  } catch {
    // Un indirizzo illeggibile vale come assente.
  }
  return "/";
}

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data.json();
  } catch {
    // Con userVisibleOnly una notifica va mostrata comunque.
  }
  const path = internalPath(message.url);
  event.waitUntil(
    self.registration.showNotification(message.title || "Lanterne", {
      body: message.body,
      icon: "/icon-192.png",
      // Un nuovo avviso per la stessa persona sostituisce il precedente, invece di accumularsi.
      tag: path,
      data: { url: path },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = internalPath(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => internalPath(client.url) === path);
      return open ? open.focus() : self.clients.openWindow(path);
    }),
  );
});

// Solo le navigazioni, e nessuna risposta in cache: le pagine dell'app contengono dati personali.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});
