"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the browser's network state via navigator.onLine + the
 * online/offline window events. Useful as a fast-path signal because a
 * WebSocket can keep reporting `open` for up to a TCP timeout (~30s)
 * after the network actually drops.
 *
 * Defaults to `true` on first render so consumers don't flash an
 * "Offline" UI before the effect can read the real value.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  return online;
}
