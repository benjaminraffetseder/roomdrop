package main

import (
	"net"
	"testing"
)

func TestLANAdaptersRankBeforeVirtualAndVPNAdapters(t *testing.T) {
	for _, lan := range []string{"Wi-Fi", "Ethernet", "en0", "enp3s0", "wlp2s0", "LAN"} {
		for _, virtual := range []string{"VMware Network Adapter VMnet1", "VMware Network Adapter VMnet8", "NordLynx", "vEthernet (Default Switch)", "utun3", "wg0", "tun0", "docker0", "veth123", "Tailscale"} {
			if networkPriority(net.Interface{Name: lan}) >= networkPriority(net.Interface{Name: virtual}) {
				t.Errorf("%q must rank before %q", lan, virtual)
			}
		}
	}
}

func TestCustomPointToPointAdapterDoesNotOutrankLAN(t *testing.T) {
	tunnel := net.Interface{Name: "Office connection", Flags: net.FlagUp | net.FlagPointToPoint}
	lan := net.Interface{Name: "Wi-Fi", Flags: net.FlagUp | net.FlagBroadcast}
	if networkPriority(tunnel) <= networkPriority(lan) {
		t.Fatal("custom point-to-point connection outranks Wi-Fi")
	}
	if networkPriority(net.Interface{Name: "My connection"}) >= networkPriority(tunnel) {
		t.Fatal("an unknown connection should remain a fallback before known tunnels")
	}
}
