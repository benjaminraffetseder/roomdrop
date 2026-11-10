package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

func TestUpdateAssetMatcher(t *testing.T) {
	// Put installers and distribution archives first, like GitHub's sorted list.
	names := []string{
		"RoomDrop-v0.3.0-linux-amd64.deb", "RoomDrop-v0.3.0-linux-amd64.rpm",
		"RoomDrop-v0.3.0-linux-amd64.tar.gz", "RoomDrop-v0.3.0-linux-amd64.AppImage",
		"RoomDrop-v0.3.0-macos-universal.dmg", "RoomDrop-v0.3.0-macos-universal.zip.sig",
		"RoomDrop-v0.3.0-windows-amd64-setup.exe", "RoomDrop-v0.3.0-windows-amd64-installer.exe",
		"RoomDrop-v0.3.0-windows-amd64-portable.zip", "RoomDrop-v0.3.0-windows-amd64.exe.sha256",
		"RoomDrop-v0.3.0-windows-amd64.exe", "RoomDrop-v0.3.0-windows-arm64.exe",
		"RoomDrop-v0.3.0-macos-universal.zip", "RoomDrop-v0.3.0-linux-amd64",
		"SHA256SUMS.txt",
	}
	assets := make([]github.ReleaseAsset, len(names))
	for i, name := range names {
		assets[i].Name = name
	}
	for _, tc := range []struct {
		platform, arch string
		appImage       bool
		want           string
	}{
		{"windows", "amd64", false, "RoomDrop-v0.3.0-windows-amd64.exe"},
		{"windows", "arm64", false, "RoomDrop-v0.3.0-windows-arm64.exe"},
		{"darwin", "amd64", false, "RoomDrop-v0.3.0-macos-universal.zip"},
		{"darwin", "arm64", false, "RoomDrop-v0.3.0-macos-universal.zip"},
		{"linux", "amd64", false, "RoomDrop-v0.3.0-linux-amd64"},
		{"linux", "amd64", true, "RoomDrop-v0.3.0-linux-amd64.AppImage"},
		{"windows", "386", false, ""},
		{"linux", "arm64", true, ""},
		{"freebsd", "amd64", false, ""},
	} {
		t.Run(fmt.Sprintf("%s/%s/appimage=%t", tc.platform, tc.arch, tc.appImage), func(t *testing.T) {
			idx := updateAssetMatcher(tc.appImage)(updater.CheckRequest{Platform: tc.platform, Arch: tc.arch}, assets)
			if tc.want == "" {
				if idx != -1 {
					t.Fatalf("matched unsupported platform: %s", names[idx])
				}
			} else if idx < 0 || names[idx] != tc.want {
				t.Fatalf("index = %d, want %s", idx, tc.want)
			}
		})
	}
	for _, idx := range []int{3, 10, 12, 13} {
		req := updater.CheckRequest{Platform: "windows", Arch: "amd64"}
		if idx == 3 || idx == 13 {
			req.Platform = "linux"
		}
		if idx == 12 {
			req.Platform = "darwin"
		}
		withoutPayload := append([]github.ReleaseAsset{}, assets[:idx]...)
		withoutPayload = append(withoutPayload, assets[idx+1:]...)
		if got := updateAssetMatcher(idx == 3)(req, withoutPayload); got != -1 {
			t.Fatalf("missing payload %s fell back to %s", names[idx], withoutPayload[got].Name)
		}
	}
}

const updateTestFilename = "RoomDrop-v0.3.0-windows-amd64.exe"

func testUpdateProvider(t *testing.T, checksum, payload string) checksumProvider {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/repos/benjaminraffetseder/roomdrop/releases/latest":
			assets := []map[string]any{
				{"name": "RoomDrop-v0.3.0-windows-amd64-setup.exe", "url": "http://" + r.Host + "/installer"},
				{"name": updateTestFilename, "url": "http://" + r.Host + "/binary", "size": len(payload)},
			}
			if checksum != "" {
				assets = append(assets, map[string]any{"name": "SHA256SUMS.txt", "url": "http://" + r.Host + "/sums"})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tag_name": "v0.3.0", "body": "Release notes", "assets": assets,
			})
		case "/sums":
			fmt.Fprint(w, checksum)
		case "/binary":
			fmt.Fprint(w, payload)
		default:
			t.Errorf("unexpected request: %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	provider, err := github.New(github.Config{
		Repository: "benjaminraffetseder/roomdrop", BaseURL: server.URL,
		ChecksumAsset: "SHA256SUMS.txt", AssetMatcher: updateAssetMatcher(false),
	})
	if err != nil {
		t.Fatal(err)
	}
	return checksumProvider{provider}
}

func TestGitHubUpdateChecksums(t *testing.T) {
	const payload = "new RoomDrop binary"
	digest := sha256.Sum256([]byte(payload))
	valid := fmt.Sprintf("%x  %s\n", digest, updateTestFilename)
	req := updater.CheckRequest{CurrentVersion: "0.2.0", Platform: "windows", Arch: "amd64"}
	p := testUpdateProvider(t, valid, payload)
	release, err := p.Check(t.Context(), req)
	if err != nil {
		t.Fatal(err)
	}
	if release == nil || release.Version != "0.3.0" || release.Notes != "Release notes" ||
		release.Artifact.Filename != updateTestFilename || !bytes.Equal(release.Verification.Digest, digest[:]) {
		t.Fatalf("unexpected release: %+v", release)
	}
	var downloaded bytes.Buffer
	if err := p.Download(t.Context(), release, &downloaded, nil); err != nil {
		t.Fatal(err)
	}
	if downloaded.String() != payload {
		t.Fatal("downloaded the wrong payload")
	}
	for _, tc := range []struct{ name, checksum string }{
		{"missing sidecar", ""},
		{"missing entry", fmt.Sprintf("%x  other.exe\n", digest)},
		{"malformed digest", "not-hex  " + updateTestFilename},
		{"short digest", "ab  " + updateTestFilename},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := testUpdateProvider(t, tc.checksum, payload)
			if release, err := p.Check(t.Context(), req); err == nil || release != nil {
				t.Fatalf("accepted unchecked release: %+v, error %v", release, err)
			}
		})
	}
	// Already-current releases need no download or checksum lookup.
	req.CurrentVersion = "0.3.0"
	if release, err := testUpdateProvider(t, "", payload).Check(t.Context(), req); err != nil || release != nil {
		t.Fatalf("current version: release %+v, error %v", release, err)
	}
}

type headlessUpdateHost struct{}

func (headlessUpdateHost) Emit(string, ...any) bool         { return true }
func (headlessUpdateHost) OnEvent(string, func(any)) func() { return func() {} }
func (headlessUpdateHost) OpenWindow(updater.WindowOptions) updater.WindowHandle {
	panic("unexpected update window")
}
func (headlessUpdateHost) Quit() { panic("unexpected restart") }

func TestGitHubUpdateRejectsCorruptedDownload(t *testing.T) {
	digest := sha256.Sum256([]byte("original binary"))
	provider := testUpdateProvider(t, fmt.Sprintf("%x  %s\n", digest, updateTestFilename), "corrupted binary")
	u := updater.New(headlessUpdateHost{})
	if err := u.Init(updater.Config{
		CurrentVersion: "0.2.0", Platform: "windows", Arch: "amd64",
		Providers: []updater.Provider{provider}, Window: updater.WindowNone,
	}); err != nil {
		t.Fatal(err)
	}
	err := u.CheckAndInstall(context.Background())
	if err == nil || !strings.Contains(err.Error(), "digest mismatch") || u.State() != updater.StateError {
		t.Fatalf("corrupt payload: state %s, error %v", u.State(), err)
	}
}
