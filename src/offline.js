const OFFLINE_EVENT = "football-os:offline-status";

const productionBuild = typeof import.meta.env !== "undefined" && import.meta.env.PROD;

/*
 * The last status is latched, because `registerOfflineSupport()` can emit
 * synchronously at module load -- when there is no service worker to register --
 * which is before React has mounted and subscribed. Without the latch that first
 * status is lost and the header stays on "Preparing offline" forever, even though
 * nothing is preparing.
 */
let lastStatus = null;

function emitStatus(detail) {
  lastStatus = detail;
  window.dispatchEvent(new CustomEvent(OFFLINE_EVENT, { detail }));
}

function currentResourceUrls() {
  const urls = new Set([window.location.origin, `${window.location.origin}/index.html`, `${window.location.origin}/manifest.webmanifest`]);
  window.performance?.getEntriesByType?.("resource").forEach((entry) => {
    try {
      const url = new URL(entry.name);
      if (url.origin === window.location.origin) urls.add(url.href);
    } catch {
      // Ignore browser-internal or malformed performance entries.
    }
  });
  return [...urls];
}

async function primeOfflineCache(registration) {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), 5000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data?.ready === true);
    };
    worker.postMessage({ type: "CACHE_URLS", urls: currentResourceUrls() }, [channel.port2]);
  });
}

export async function registerOfflineSupport() {
  if (!productionBuild || !("serviceWorker" in navigator)) {
    emitStatus({ supported: "serviceWorker" in navigator, ready: false, development: true });
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const ready = await primeOfflineCache(registration);
    emitStatus({ supported: true, ready, development: false });
    return registration;
  } catch {
    emitStatus({ supported: true, ready: false, development: false });
    return null;
  }
}

export function subscribeOfflineStatus(callback) {
  const update = (event) => {
    const detail = event?.detail ?? lastStatus;
    callback({
      online: navigator.onLine,
      supported: detail?.supported ?? "serviceWorker" in navigator,
      ready: detail?.ready ?? Boolean(navigator.serviceWorker?.controller),
      development: detail?.development ?? !productionBuild,
    });
  };
  update();
  const onOnline = () => update();
  const onOffline = () => update();
  window.addEventListener(OFFLINE_EVENT, update);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener(OFFLINE_EVENT, update);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export async function refreshOfflineCopy() {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  await registration.update();
  const ready = await primeOfflineCache(registration);
  emitStatus({ supported: true, ready, development: false });
  return ready;
}
