"use client";

import { useEffect, useState } from "react";

export function RegisterServiceWorker() {
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    let refreshing = false;
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ apply?: () => void }>).detail;
      if (typeof detail?.apply === "function") setApplyUpdate(() => detail.apply!);
    };
    window.addEventListener("grassroots:pwa-update", onUpdate);
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      const announceUpdate = (worker: ServiceWorker | null) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("grassroots:pwa-update", {
              detail: { apply: () => worker.postMessage({ type: "SKIP_WAITING" }) },
            }));
          }
        });
      };
      announceUpdate(registration.installing);
      registration.addEventListener("updatefound", () => announceUpdate(registration.installing));
      void registration.update();
    });
    return () => {
      window.removeEventListener("grassroots:pwa-update", onUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!applyUpdate) return null;
  return (
    <aside className="fixed inset-x-4 bottom-20 z-toast mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl bg-ink p-4 text-background shadow-sm" role="status">
      <p className="text-sm font-semibold">An update is ready.</p>
      <button className="min-h-11 rounded-lg bg-background px-4 text-sm font-semibold text-ink" type="button" onClick={applyUpdate}>Update GrassRoots</button>
    </aside>
  );
}
