// ---------------------------------------------------------------------------
// Build freshness guard.
//
// Detects when a newer build has been deployed so a device stuck on a stale
// cached bundle can one-tap refresh — instead of silently running old code
// and (worse) reading/writing an out-of-date slice of the shared tournament.
//
// GitHub Pages gives us no control over cache headers and we ship no service
// worker, so the check lives in the app: read the hashed main-bundle name
// this page actually loaded with, then periodically re-fetch index.html
// (cache-busted) and compare. A mismatch means `main` has moved on.
//
// We NEVER reload on our own — only surface a prompt the user taps — so there
// is no reload-loop risk, and every failure mode (offline, blocked, dev) is a
// silent no-op that simply retries on the next tick.
// ---------------------------------------------------------------------------

const BUNDLE_RE = /assets\/index-[\w-]+\.js/;

/** The `<script>` element that loaded the app's hashed main bundle, or null
 *  in dev / when it can't be found (in which case the check is a no-op). */
function bundleScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="assets/index-"]',
  );
}

/** The hashed main-bundle path the server is currently serving, freshly
 *  fetched past the cache. null on any failure (offline, blocked, no match).
 *  The index.html URL is derived from the running bundle's own src so it
 *  works under any base path without needing build-time config. */
async function deployedBundle(scriptSrc: string): Promise<string | null> {
  // ".../assets/index-abc.js" → ".../index.html"
  const indexUrl = scriptSrc.replace(/assets\/index-[\w-]+\.js.*$/, "index.html");
  try {
    const res = await fetch(`${indexUrl}?cb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(BUNDLE_RE);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

/** Poll for a newer deploy; calls `onStale` once when the deployed main bundle
 *  differs from the one running. Also checks on boot and whenever the tab is
 *  brought back to the foreground (phones that were pocketed all round).
 *  No-ops in dev where there's no hashed bundle to compare. Returns a cleanup. */
export function watchForUpdate(
  onStale: () => void,
  intervalMs = 60000,
): () => void {
  const script = bundleScript();
  const current = script?.src.match(BUNDLE_RE)?.[0];
  if (!script || !current) return () => {};

  let stopped = false;
  const check = async () => {
    if (stopped) return;
    const latest = await deployedBundle(script.src);
    if (!stopped && latest && latest !== current) onStale();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };

  const timer = setInterval(check, intervalMs);
  document.addEventListener("visibilitychange", onVisible);
  void check();

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
