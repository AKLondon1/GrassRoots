const CACHE_NAME = "grassroots-public-v2";
const PUBLIC_CACHE_ALLOWLIST = new Set(["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"]);
const PUBLIC_SHELL = [...PUBLIC_CACHE_ALLOWLIST];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(async () => {
        if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
        await self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.search ||
    !PUBLIC_CACHE_ALLOWLIST.has(url.pathname)
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title : "GrassRoots update";
  const body = typeof payload.body === "string" ? payload.body : "Open GrassRoots to view the latest club update.";
  const candidateUrl = typeof payload.url === "string" ? payload.url : "/app";
  let url = "/app";
  try { const parsed = new URL(candidateUrl, self.location.origin); if (parsed.origin === self.location.origin) url = `${parsed.pathname}${parsed.search}`; } catch {}
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url }, tag: typeof payload.tag === "string" ? payload.tag : undefined }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).pathname === new URL(url, self.location.origin).pathname);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
