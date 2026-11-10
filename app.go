package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"sort"
	"sync"

	"github.com/benjaminraffetseder/roomdrop/internal/share"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// App exposes native file selection and sharing. The LAN server never exposes
// these methods: it can only serve the current session's selected payload.
type App struct {
	manager *share.Manager
	mu      sync.Mutex
	files   []share.Item
}

func NewApp() *App { return &App{manager: share.NewManager()} }

type Network struct {
	Address string `json:"address"`
	Name    string `json:"name"`
}

func (a *App) Networks() ([]Network, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, errors.New("Could not read your network connections.")
	}
	networks := []Network{}
	priorities := make(map[string]int, len(interfaces))
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		priorities[iface.Name] = networkPriority(iface)
		addresses, _ := iface.Addrs()
		for _, address := range addresses {
			ip, _, err := net.ParseCIDR(address.String())
			if err == nil && ip.To4() != nil && ip.IsPrivate() {
				networks = append(networks, Network{Address: ip.String(), Name: iface.Name})
			}
		}
	}
	// Keep every adapter selectable, but put likely LAN connections first.
	sort.SliceStable(networks, func(i, j int) bool {
		return priorities[networks[i].Name] < priorities[networks[j].Name]
	})
	return networks, nil
}

func (a *App) SelectFiles(folder bool) ([]share.Item, error) {
	dialog := application.Get().Dialog.OpenFile().CanChooseFiles(!folder).CanChooseDirectories(folder).SetTitle("Choose something to share")
	paths, err := dialog.PromptForMultipleSelection()
	if err != nil {
		return nil, errors.New("Could not open the file picker. Try dropping your files instead.")
	}
	if len(paths) == 0 {
		return []share.Item{}, nil
	}
	return a.AddPaths(paths)
}

func (a *App) AddPaths(paths []string) ([]share.Item, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.manager.Snapshot().State == "sharing" {
		return nil, errors.New("Stop the current session before adding files.")
	}
	items, err := share.Inspect(paths)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		duplicate := false
		for _, selected := range a.files {
			if selected.Path == item.Path {
				duplicate = true
				break
			}
		}
		if !duplicate {
			a.files = append(a.files, item)
		}
	}
	return append([]share.Item{}, a.files...), nil
}

func (a *App) RemoveFile(path string) []share.Item {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.manager.Snapshot().State == "sharing" {
		return append([]share.Item{}, a.files...)
	}
	for i, item := range a.files {
		if item.Path == path {
			a.files = append(a.files[:i], a.files[i+1:]...)
			break
		}
	}
	return append([]share.Item{}, a.files...)
}

func (a *App) Start(minutes int, once bool, address, password string) (share.Snapshot, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	networks, err := a.Networks()
	if err != nil {
		return share.Snapshot{}, err
	}
	found := false
	for _, network := range networks {
		found = found || network.Address == address
	}
	if !found {
		return share.Snapshot{}, errors.New("Connect to a local network, then select its address and try again.")
	}
	paths := make([]string, len(a.files))
	for i, item := range a.files {
		paths[i] = item.Path
	}
	return a.manager.Start(paths, minutes, once, address, password)
}

func (a *App) Status() share.Snapshot { return a.manager.Snapshot() }
func (a *App) Stop() share.Snapshot   { a.manager.Stop(); return a.manager.Snapshot() }

func (a *App) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.manager.Reset()
	a.files = nil
}

func (a *App) CopyLink() error {
	snapshot := a.manager.Snapshot()
	if snapshot.State != "sharing" {
		return errors.New("This link is no longer active.")
	}
	if !application.Get().Clipboard.SetText(snapshot.URL) {
		return errors.New("Could not copy the link. Select it and copy it manually.")
	}
	return nil
}

func (a *App) DeviceName() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "This computer"
	}
	return name
}

// Native drop events stage paths; the UI starts with the current expiry settings.
func (a *App) dropped(paths []string) {
	items, err := a.AddPaths(paths)
	if err != nil {
		application.Get().Event.Emit("roomdrop:error", fmt.Sprint(err))
		return
	}
	application.Get().Event.Emit("roomdrop:files", items)
}

func (a *App) ServiceShutdown() error { a.manager.Stop(); return nil }
