import assert from "node:assert/strict"
import { test } from "node:test"
import {
  readNetworkPreference,
  rememberNetwork,
  resolveNetworkAddress,
} from "../src/lib/network-preference.ts"

const wifi = { name: "Wi-Fi", address: "192.168.50.10" }
const vpn = { name: "VPN", address: "10.10.0.2" }

function mockStorage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const values = new Map()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous)
    else Reflect.deleteProperty(globalThis, "localStorage")
  })
  return values
}

test("restores the selected adapter after a new launch with a different list order", (t) => {
  mockStorage(t)
  rememberNetwork(wifi)
  assert.equal(
    resolveNetworkAddress([vpn, wifi], readNetworkPreference()),
    wifi.address,
  )
})

test("follows a remembered adapter when its IP address changes", (t) => {
  mockStorage(t)
  rememberNetwork(wifi)
  const reconnected = { ...wifi, address: "192.168.50.42" }
  assert.equal(
    resolveNetworkAddress([vpn, reconnected], readNetworkPreference()),
    reconnected.address,
  )
})

test("does not confuse another adapter using the old saved address with Wi-Fi", (t) => {
  mockStorage(t)
  rememberNetwork(wifi)
  const ethernet = { name: "Ethernet", address: "192.168.70.20" }
  const reused = { name: "Other adapter", address: wifi.address }
  assert.equal(
    resolveNetworkAddress(
      [ethernet, reused],
      readNetworkPreference(),
      wifi.address,
    ),
    ethernet.address,
  )
})

test("keeps the preference through a temporary fallback and restores it when available", (t) => {
  mockStorage(t)
  rememberNetwork(wifi)
  assert.equal(
    resolveNetworkAddress([vpn], readNetworkPreference()),
    vpn.address,
  )
  assert.deepEqual(readNetworkPreference(), wifi)
  assert.equal(
    resolveNetworkAddress([vpn, wifi], readNetworkPreference(), vpn.address),
    wifi.address,
  )
})

test("restores the chosen address when the adapter has several IPv4 addresses", () => {
  const secondary = { ...wifi, address: "192.168.50.11" }
  assert.equal(
    resolveNetworkAddress([wifi, secondary], secondary),
    secondary.address,
  )
})

test("handles an offline launch without discarding the preference", (t) => {
  mockStorage(t)
  rememberNetwork(wifi)
  assert.equal(resolveNetworkAddress([], readNetworkPreference()), "")
  assert.equal(
    resolveNetworkAddress([vpn, wifi], readNetworkPreference()),
    wifi.address,
  )
})

test("preserves the current selection on refresh when no preference exists", () => {
  assert.equal(
    resolveNetworkAddress([vpn, wifi], null, wifi.address),
    wifi.address,
  )
  assert.equal(resolveNetworkAddress([vpn, wifi], null), vpn.address)
})

test("ignores missing and invalid stored preferences", (t) => {
  const values = mockStorage(t)
  assert.equal(readNetworkPreference(), null)
  for (const value of [
    "invalid JSON",
    "null",
    "[]",
    "{}",
    '{"name":"Wi-Fi"}',
    '{"name":0,"address":"192.168.50.10"}',
    '{"name":"","address":"192.168.50.10"}',
  ]) {
    values.set("roomdrop-network", value)
    assert.equal(readNetworkPreference(), null)
  }
})

test("allows an in-session choice when local storage cannot be read or written", (t) => {
  mockStorage(t)
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage unavailable")
    },
  })
  assert.equal(readNetworkPreference(), null)
  assert.doesNotThrow(() => rememberNetwork(wifi))
  assert.equal(
    resolveNetworkAddress([vpn, wifi], readNetworkPreference(), wifi.address),
    wifi.address,
  )
})
