import { System } from "@wailsio/runtime"
import { useSyncExternalStore } from "react"

function isDesktop() {
  return typeof window !== "undefined" && System.IsDesktop()
}

function subscribe(onChange: () => void) {
  // Windows injects the native environment after the frontend modules have loaded.
  window.addEventListener("wails:runtime-config-ready", onChange)
  return () =>
    window.removeEventListener("wails:runtime-config-ready", onChange)
}

export function useDesktop() {
  return useSyncExternalStore(subscribe, isDesktop, () => false)
}
