/**
 * Service-worker registration (installability, offline shell, Web Push).
 *
 * Also watches for a newer worker and tells the caller, so the app can offer a
 * refresh instead of leaving someone on a stale build until every tab closes.
 */
export function registerServiceWorker({ onUpdateReady } = {}) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // `controller` is null on the very first install — that's not an
          // update, it's the initial activation.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            onUpdateReady?.(() => {
              installing.postMessage("SKIP_WAITING");
              window.location.reload();
            });
          }
        });
      });
    } catch (err) {
      console.warn("Service worker registration failed:", err);
    }
  });
}
