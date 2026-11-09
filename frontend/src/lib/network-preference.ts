export interface NetworkPreference {
  name: string
  address: string
}

const storageKey = "roomdrop-network"

export function readNetworkPreference(): NetworkPreference | null {
  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return null
    const value: unknown = JSON.parse(stored)
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string" &&
      value.name.trim() !== "" &&
      "address" in value &&
      typeof value.address === "string" &&
      value.address.trim() !== ""
    ) {
      return { name: value.name, address: value.address }
    }
  } catch {
    // A missing or invalid preference must not prevent local sharing.
  }
  return null
}

export function rememberNetwork(network: NetworkPreference) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ name: network.name, address: network.address }),
    )
  } catch {
    // Selection still works for this session when storage is unavailable.
  }
}

export function resolveNetworkAddress(
  networks: readonly NetworkPreference[],
  preference: NetworkPreference | null,
  currentAddress = "",
): string {
  if (preference) {
    // Match the adapter first: DHCP may change its address, or give the old
    // address to another adapter. Preserve the exact address when possible.
    const adapterAddresses = networks.filter(
      (network) => network.name === preference.name,
    )
    const selected =
      adapterAddresses.find(
        (network) => network.address === preference.address,
      ) ?? adapterAddresses[0]
    return selected?.address ?? networks[0]?.address ?? ""
  }

  return (
    networks.find((network) => network.address === currentAddress)?.address ??
    networks[0]?.address ??
    ""
  )
}
