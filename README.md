<img src="assets/icon.svg" width="64" height="64" alt="RoomDrop">

# RoomDrop

Send and receive files over your local network.

RoomDrop is a small Wails 3 desktop utility for Windows, macOS, and Linux. Share files from your computer, or choose **Receive** to let another device send files back through its browser. Scan the QR code or open the local link on the same network. The other device needs no installation.

![RoomDrop desktop app](docs/images/roomdrop.png)

## Sending files

1. Connect both devices to the same local network.
2. Choose a session lifetime: 5, 15, or 30 minutes, or 1 hour. Optionally enable **One-time download** or **Password protection**. Enter a download password before choosing files if protection is enabled.
3. Drop files or folders onto the drop zone, or use the native file picker. A sharing session starts automatically.
4. Share the QR code or use **Copy** to copy the full link. For protected sessions, share the password separately. The recipient opens the page, enters the password if required, and chooses **Download**.
5. Watch real transfer progress in RoomDrop. Choose **Stop sharing** to revoke the link and cancel ongoing transfers. Closing the window also stops sharing and leaves RoomDrop in the system tray.

Single files download in their original format. Multiple files and folders are bundled into one ZIP, including empty directories. ZIP creation uses temporary disk space and can be cancelled. The temporary ZIP is removed when the session ends normally; a forced process termination or crash can leave a `roomdrop-*.zip` file in your OS temporary directory. Original files are never removed.

One-time sessions allow one active download. They close after the complete payload has been sent to the browser; opening or previewing the page does not consume the link. Failed transfers can be retried until the session expires. A completed transfer confirms bytes were sent to the browser, not that the recipient saved the file.

Password protection applies to downloads; filenames and sizes remain visible on the sharing page. Incorrect passwords do not start a transfer or consume a one-time link. After five incorrect attempts, the session pauses password attempts for 30 seconds. Passwords stay out of sharing links and QR codes, and RoomDrop never saves them to disk. Starting a new drop clears the password setting.

## Receiving files

1. Choose **Receive** in the desktop app.
2. Choose a destination folder and a session lifetime, then select **Start receiving**.
3. Scan the QR code or open the link on the other device. Both devices must use the same local network.
4. In the browser, choose photos or files and select **Send files**. Files upload one at a time, with progress in the browser and desktop app. **Received** confirms that the file was saved and closed on the computer.
5. Choose **Stop receiving** to revoke the link and cancel unfinished uploads. Closing the window or choosing **Stop session** from the tray does the same. Completed files stay in the selected folder.

Receive sessions accept individual files up to 10 GiB each, including empty files. Multiple files can be selected together; folder uploads are not supported. Existing files are never overwritten: another `photo.jpg` becomes `photo (2).jpg`. Filenames must be portable across supported platforms, with no path separators, reserved device names, control characters, or more than 180 UTF-8 bytes. The latest 50 received files and transfers appear in the app; totals cover the entire session.

Anyone with an active receive link on the reachable local network can write files into the selected folder. The browser cannot list or download that folder, and the destination path is not exposed on the upload page. Receive mode does not currently offer password protection or one-time links. Transfers use the same unencrypted local HTTP as Send mode.

Cancel in the browser to stop the current upload and the rest of its batch. **Send files** retries unfinished files without re-uploading files already confirmed in that page. If the connection fails after a file was saved but before confirmation arrives, check the destination before retrying; the retry may create a numbered copy. Successfully received files remain even if a later file fails.

Files are written directly into the destination while uploading. Interrupted files are removed during normal cancellation, expiration, and shutdown. A crash or forced process termination can leave an incomplete file; check its contents before using it. Avoid modifying or moving incoming files until they are marked **Received**.

## System tray

RoomDrop adds its icon to the system tray while running. Click it to reopen the window, including when minimized. Right-click for **Open RoomDrop**, **Stop session**, **Check for updates…**, and **Quit RoomDrop**. On Windows, the icon may appear in the tray overflow menu.

Closing the window stops the active send or receive session but keeps the tray icon available. **Quit RoomDrop** stops any transfers and exits the app.

## Updates

Choose **Check for updates** in Settings or the tray menu. RoomDrop checks this repository's latest stable GitHub Release and opens the built-in Wails updater window with release notes, download progress, and any errors. Downloads must match the release's `SHA256SUMS.txt` entry before they are staged. Choose **Restart & Apply** when ready; restarting stops active sharing. Checks run only when requested and require internet access. Browser previews cannot update the native app.

The installation directory must be writable by your user. On Windows, use a portable copy or a per-user installation (`wails3 task windows:package INSTALL_SCOPE=user`). Linux AppImages update the original AppImage; standalone Linux binaries update in place. Installations managed by a system package manager should be updated through that package manager.

Releases predating this feature need one manual upgrade to a build containing the updater.

## Local network notes

- Both devices must be able to reach one another. Guest Wi-Fi, client isolation, VPNs, and restrictive firewalls may prevent transfers. Allow RoomDrop through your firewall on **private networks** when appropriate.
- If you have several adapters, choose the correct address in Settings before starting a drop. RoomDrop remembers your selected adapter across restarts and follows its current IP address. If it is temporarily unavailable, an available adapter is selected without erasing your preference. RoomDrop binds only to that IPv4 adapter and a temporary OS-assigned port.
- Links contain a cryptographically random 256-bit token. Anyone with that link on the reachable local network can download unless password protection is enabled. Keep it private.
- Transfers use local HTTP and are **not encrypted**, including download passwords. Use a trusted network. RoomDrop rejects public source addresses, but this does not authenticate devices or protect against an on-path observer.
- Keep RoomDrop open and the computer awake while sharing. Keep single source files unchanged during a session. Symbolic links and special files are rejected; choose their original files instead.
- Activity and selections are held only in memory. No database, accounts, external fonts, or analytics are used. File transfers stay on the local network; manual update checks and downloads contact GitHub Releases.

## Develop

Requirements: Go 1.26+, Node.js 26+, npm, the Wails **3.1.0** CLI, and the [native prerequisites for your platform](https://v3.wails.io/getting-started/installation/). Windows requires WebView2. macOS requires the Xcode command line tools. Linux requires the Wails GTK/WebKit development dependencies.

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
wails3 dev
```

Run these commands in the repository root. Wails installs frontend dependencies, generates Go bindings, and starts the native app with Vite hot reload.

For a production executable:

```sh
wails3 build
```

For a frontend-only view, first run `wails3 build` to generate bindings, then:

```sh
cd frontend
npm run dev
```

A plain browser displays the interface with sharing controls disabled. Real local transfers require the desktop app; the browser preview does not simulate a server or invent transfer activity.

The UI uses shadcn/ui with Base UI primitives. Its configuration is in `frontend/components.json`; theme colors and shadows live in `frontend/src/styles.css`. From `frontend/`, use `npx shadcn@latest add <component>` to add components, or `npx shadcn@latest add <component> --diff` to review upstream changes to an existing component.

## Versioning

The `version` in `frontend/package.json` is the single source of truth. Settings reads it directly and the Go executable embeds it for update comparisons; the npm lockfile and native packaging metadata are synchronized automatically before builds and frontend development.

To bump the version and synchronize all metadata without creating a Git commit or tag, run from `frontend/`:

```sh
npm version 0.3.0 --no-git-tag-version
```

Use a numeric `major.minor.patch` release version for native packaging. If you edit the version directly, run `node scripts/sync-version.mjs` from the repository root. `node scripts/sync-version.mjs --check` verifies that the checked-in metadata matches without changing files. The synchronizer updates only version fields and preserves custom packaging settings.

## Preparing GitHub Releases

After bumping the version, run `wails3 task release:updater` on each target platform. Windows and Linux use the host architecture by default; pass `ARCH=arm64` or `ARCH=amd64` when cross-building. macOS must run on a Mac and builds a universal `.app` ZIP for both architectures. Outputs are collected in `bin/release/v<version>/`.

The updater accepts these asset names (using `0.3.0` as an example):

| Installation | Update asset |
| --- | --- |
| Windows x64 | `RoomDrop-v0.3.0-windows-amd64.exe` |
| Windows ARM64 | `RoomDrop-v0.3.0-windows-arm64.exe` |
| macOS Intel or Apple Silicon | `RoomDrop-v0.3.0-macos-universal.zip` |
| Linux standalone | `RoomDrop-v0.3.0-linux-amd64` (or `arm64`) |
| Linux AppImage | `RoomDrop-v0.3.0-linux-amd64.AppImage` (or `arm64`) |

The macOS ZIP must contain exactly one `.app`. Build AppImages separately with the existing Linux packaging tasks. Installers, portable archives, DMGs, `.deb`, `.rpm`, signatures, and checksum sidecars are excluded from update selection. Keep publishing conventional packages for first-time installations; the Linux distribution tarball containing documentation cannot serve as an update payload.

Collect all platforms' assets into the same `bin/release/v<version>/` directory, then run `node scripts/prepare-update.mjs checksums` to regenerate one `SHA256SUMS.txt` covering every asset. Run this **after** any code signing or notarization has changed the packaged bytes. Upload those exact files and the checksum file together to a GitHub Release tagged `v<version>` in `benjaminraffetseder/roomdrop`. Publish only after every intended update asset is present. Drafts and prereleases are ignored.

SHA-256 verifies integrity against GitHub's release assets; this setup does not pin a separate publisher signing key. See the [Wails updater guide](https://wails.io/guides/updater/) for signature verification.

## Checks

From the root:

```sh
go test . ./internal/...
go vet . ./internal/...
node scripts/sync-version.mjs --check
```

From `frontend/`, after generating bindings:

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

The Go tests cover real HTTP downloads and uploads, duplicate incoming filenames, interrupted upload cleanup, one-time link previews and retries, concurrent requests, cancellation, expiration, request isolation, ZIP contents and cleanup, escaped filenames, symbolic links, and input validation.

The React tests cover send/receive mode selection, destination selection, native action ordering, cancellation, clipboard feedback, effect cleanup, and keyboard interaction. Browser upload tests exercise the embedded script's progress, saved-file confirmations, retries, cancellation, and safe text rendering. Network preference tests cover remembering adapters across restarts and address changes.

On Windows, after `wails3 build`, run `powershell -File scripts/test-uninstaller.ps1` to verify that uninstalling preserves unrelated files in an existing destination folder. The test uses an isolated installation and registry entry.

Full dependency notices are generated before frontend builds and can be read under **Settings → Open-source licenses**. Run `node scripts/generate-notices.mjs --check` to verify the checked-in notices.

Built from the [Wails React/TypeScript template](https://github.com/benjaminraffetseder/wails-react-ts-shadcn-template), using React, TypeScript, Base UI, Tailwind CSS, and Go. MIT licensed.
