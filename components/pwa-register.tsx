"use client";

import { useEffect } from "react";

export function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    registerServiceWorker().catch(() => {
      // L'app funziona anche senza: manca solo la pagina offline.
    });
  }, []);
  return null;
}
