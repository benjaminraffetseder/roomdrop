# Contributing to RoomDrop

Keep RoomDrop focused on temporary, direct local file sharing. Reuse the existing Go session manager and frontend components. Changes must preserve explicit revocation, unpredictable links, safe ZIP paths, bounded in-memory activity, and cleanup of temporary archives.

Before submitting, run the checks in [README.md](README.md) and build with `wails3 build`. For changes to transfer behavior, exercise the real HTTP path and add focused regression coverage. For native interface changes, verify file selection, drag and drop, QR scanning, clipboard copy, keyboard focus, cancellation, and window close behavior on your target OS. Report the platform actually tested.

Never commit `node_modules`, generated bindings, `frontend/dist`, binaries, credentials, or recipients' file paths. Dependency changes include the updated npm lockfile. Keep the template's license and third-party notices.

For bug reports, include the OS, Go/Node/Wails versions, steps to reproduce, and the error. Remove private links and file paths from logs and screenshots.
