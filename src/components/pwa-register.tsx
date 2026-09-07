"use client";

import { useEffect } from "react";

import { capturePwaInstallPrompt } from "@/lib/pwa-install";

export function PwaRegister() {
  useEffect(() => {
    capturePwaInstallPrompt();
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore: install still works on some browsers without SW */
    });
  }, []);

  return null;
}
