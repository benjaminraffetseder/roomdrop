package main

import (
	"net"
	"strings"
)

// Names are a fallback for platforms where net.Interface does not expose the
// adapter type. Point-to-point interfaces are tunnels regardless of their name.
func networkPriority(iface net.Interface) int {
	if iface.Flags&net.FlagPointToPoint != 0 {
		return 2
	}
	name := strings.ToLower(strings.TrimSpace(iface.Name))
	for _, virtual := range []string{"virtual", "vmware", "vmnet", "vethernet", "docker", "vpn", "nordlynx", "wireguard", "tailscale", "zerotier", "vbox", "hyper-v"} {
		if strings.Contains(name, virtual) {
			return 2
		}
	}
	for _, tunnel := range []string{"utun", "tun", "tap", "wg", "ppp", "veth", "virbr", "vmbr", "bridge", "br-"} {
		if strings.HasPrefix(name, tunnel) {
			return 2
		}
	}
	for _, physical := range []string{"wi-fi", "wifi", "wireless", "wlan", "ethernet", "eth", "en", "wl", "lan"} {
		if strings.HasPrefix(name, physical) {
			return 0
		}
	}
	return 1
}
