import { lazy } from "react";

const RELOAD_KEY = "erp_chunk_reload_at";
/** Avoid reload loops if index.html itself is still stale. */
const RELOAD_COOLDOWN_MS = 15_000;

export function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return (
    error?.name === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Unable to preload CSS/i.test(message) ||
    /Failed to load module script/i.test(message)
  );
}

async function clearBrowserCaches() {
  try {
    if (typeof caches !== "undefined" && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
}

/**
 * Force a one-shot navigation refresh after a deploy (stale hashed chunks).
 * Returns true if a reload was triggered.
 */
export async function forceAppRefreshOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    const now = Date.now();
    if (last && now - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // storage blocked — still try reload
  }

  await clearBrowserCaches();

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

/** Clear reload marker after a healthy boot so the next deploy can auto-refresh again. */
export function clearChunkReloadMarker() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (last && Date.now() - last > RELOAD_COOLDOWN_MS) {
      sessionStorage.removeItem(RELOAD_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * React.lazy wrapper: retry once, then hard-refresh the app when a deploy
 * left the browser holding an old index.html that points at deleted chunks.
 */
export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (firstError) {
      if (!isChunkLoadError(firstError)) throw firstError;

      await new Promise((r) => setTimeout(r, 350));
      try {
        return await factory();
      } catch (secondError) {
        if (isChunkLoadError(secondError)) {
          const refreshing = await forceAppRefreshOnce();
          if (refreshing) {
            // Keep Suspense pending while the page navigates away.
            return new Promise(() => {});
          }
        }
        throw secondError;
      }
    }
  });
}
