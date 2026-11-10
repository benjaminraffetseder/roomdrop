import type { Item, Snapshot } from "@/hooks/use-roomdrop"

export const file: Item = {
  path: "C:/files/report.txt",
  name: "report.txt",
  size: 128,
  folder: false,
}
export const otherFile: Item = {
  ...file,
  path: "C:/files/photo.png",
  name: "photo.png",
}
export const wifi = { name: "Wi-Fi", address: "192.168.1.20" }
export const idle: Snapshot = {
  state: "idle",
  mode: "send",
  destination: "",
  uploads: 0,
  url: "",
  expiresAt: new Date(0),
  once: false,
  passwordProtected: false,
  name: "",
  size: 0,
  items: [],
  visitors: 0,
  downloads: 0,
  transfers: [],
}
export const sharing: Snapshot = {
  ...idle,
  state: "sharing",
  url: "http://192.168.1.20:8080/s/test-session",
  expiresAt: new Date(Date.now() + 900_000),
  items: [file],
  size: file.size,
  name: file.name,
}

export const receiving: Snapshot = {
  ...idle,
  mode: "receive",
  state: "sharing",
  destination: "C:/files/Received",
  url: "http://192.168.1.20:8080/s/receive-session",
  expiresAt: new Date(Date.now() + 900_000),
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}
