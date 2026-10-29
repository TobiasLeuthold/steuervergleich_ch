import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Colors computed in JS (map ramp) follow the OS theme like the CSS tokens. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
