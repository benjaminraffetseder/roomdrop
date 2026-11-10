package main

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

// Embed the same version Settings displays, including for plain go builds.
//
//go:embed frontend/package.json
var packageMetadata []byte

func configureUpdater(app *application.App) error {
	var metadata struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(packageMetadata, &metadata); err != nil {
		return fmt.Errorf("read app version: %w", err)
	}
	provider, err := github.New(github.Config{
		Repository:    "benjaminraffetseder/roomdrop",
		ChecksumAsset: "SHA256SUMS.txt",
		AssetMatcher:  updateAssetMatcher(os.Getenv("APPIMAGE") != ""),
		// AppImages include native libraries and can exceed 150 MB.
		HTTPClient: &http.Client{Timeout: 5 * time.Minute},
	})
	if err != nil {
		return err
	}
	return app.Updater.Init(updater.Config{
		CurrentVersion: metadata.Version,
		Providers:      []updater.Provider{checksumProvider{provider}},
	})
}

var updateAssetName = regexp.MustCompile(`^roomdrop-v[0-9]+\.[0-9]+\.[0-9]+-(.+)$`)

// Only accept our update payloads. Installers, portable archives containing
// documentation, package-manager packages, DMGs and sidecars cannot be swapped
// into the running executable. AppImages must remain AppImages after updating.
func updateAssetMatcher(appImage bool) github.AssetMatcher {
	return func(req updater.CheckRequest, assets []github.ReleaseAsset) int {
		var target string
		switch req.Platform {
		case "windows":
			target = "windows-" + req.Arch + ".exe"
		case "darwin":
			if req.Arch != "amd64" && req.Arch != "arm64" {
				return -1
			}
			target = "macos-universal.zip"
		case "linux":
			target = "linux-" + req.Arch
			if appImage {
				target += ".appimage"
			}
		default:
			return -1
		}
		for i, asset := range assets {
			match := updateAssetName.FindStringSubmatch(strings.ToLower(asset.Name))
			if len(match) == 2 && match[1] == target {
				return i
			}
		}
		return -1
	}
}

// Wails treats a missing checksum sidecar/entry as an unsigned release. Require
// SHA-256 here so a publishing mistake never silently bypasses verification.
type checksumProvider struct{ updater.Provider }

func (p checksumProvider) Check(ctx context.Context, req updater.CheckRequest) (*updater.Release, error) {
	release, err := p.Provider.Check(ctx, req)
	if err != nil || release == nil {
		return release, err
	}
	verification := release.Verification
	if verification == nil || verification.DigestAlgo != "sha256" || len(verification.Digest) != sha256.Size {
		return nil, errors.New("This release is missing a valid SHA-256 checksum in SHA256SUMS.txt. Please try again after the release has been fixed.")
	}
	return release, nil
}

// CheckForUpdates opens Wails' updater window. It stages verified downloads;
// the user chooses when to restart, which runs normal sharing cleanup.
func (a *App) CheckForUpdates(ctx context.Context) error {
	if !a.updateMu.TryLock() {
		return errors.New("An update check is already running.")
	}
	defer a.updateMu.Unlock()
	return application.Get().Updater.CheckAndInstall(ctx)
}
