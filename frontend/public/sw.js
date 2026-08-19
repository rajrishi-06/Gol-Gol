/* Gol·Gol service worker — offline shell, asset caching and Web Push.
 *
 * The previous version registered an empty `fetch` handler purely to satisfy
 * the installability check, so the "installable PWA" was completely dead
 * without a network. This one keeps the app shell and its hashed assets
 * available offline, and never touches API traffic (a stale ride is worse than
 * no ride).
 */

const VERSION = "v2";
const SHELL_CACHE = `golgol-shell-${VERSION}`;
const ASSET_CACHE = `golgol-assets-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/logo.svg",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

// Hosts whose responses must always come from the network: live data, auth,
// maps and telemetry. Caching any of these would show people stale reality.
const NEVER_CACHE = [/supabase\.co/, /googleapis\.com/, /google\.com/, /gstatic\.com/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` rejects wholesale if any single URL 404s, which would leave
      // the worker uninstalled; add them individually instead.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("golgol-") && !key.endsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNeverCached(url) {
  return NEVER_CACHE.some((re) => re.test(url.hostname));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || isNeverCached(url)) return;

  // Navigations: network first so a deploy is picked up immediately, falling
  // back to the cached shell when offline (the SPA router takes it from there).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then(
              (cached) =>
                cached ??
                new Response("<h1>You're offline</h1>", {
                  headers: { "Content-Type": "text/html" },
                  status: 503,
                })
            )
        )
    );
    return;
  }

  // Hashed build output and static icons: cache first, they never change under
  // a given URL.
  const isVersionedAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:svg|png|webp|woff2?|css|js)$/.test(url.pathname);

  if (isVersionedAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

// Let the page ask the worker to activate immediately after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Gol·Gol";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    data: payload.data || {},
    vibrate: [80, 40, 80],
    requireInteraction: Boolean(payload.requireInteraction),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus a tab already on the target, else navigate one, else open a tab.
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
