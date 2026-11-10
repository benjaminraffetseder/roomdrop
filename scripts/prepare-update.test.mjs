import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"

function fixture(t) {
  const tempRoot = path.resolve(os.tmpdir())
  const root = fs.mkdtempSync(path.join(tempRoot, "roomdrop-update-"))
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), tempRoot)
    fs.rmSync(root, { recursive: true, force: true })
  })
  for (const dir of ["scripts", "frontend", "bin"]) {
    fs.mkdirSync(path.join(root, dir))
  }
  fs.copyFileSync(
    new URL("./prepare-update.mjs", import.meta.url),
    path.join(root, "scripts/prepare-update.mjs"),
  )
  fs.writeFileSync(
    path.join(root, "frontend/package.json"),
    '{"version":"1.2.3"}',
  )
  const directory = path.join(root, "bin/release/v1.2.3")
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [path.join(root, "scripts/prepare-update.mjs"), ...args],
      { cwd: root, encoding: "utf8" },
    )
  return { root, directory, run }
}

const digest = (content) => createHash("sha256").update(content).digest("hex")

test("prepares raw update binaries and checksums the final release bytes", (t) => {
  const { root, directory, run } = fixture(t)
  fs.writeFileSync(path.join(root, "bin/roomdrop.exe"), "windows binary")
  fs.writeFileSync(path.join(root, "bin/roomdrop"), "linux binary")
  let result = run("windows", "arm64")
  assert.equal(result.status, 0, result.stderr)
  result = run("linux", "amd64")
  assert.equal(result.status, 0, result.stderr)
  const windows = "RoomDrop-v1.2.3-windows-arm64.exe"
  const linux = "RoomDrop-v1.2.3-linux-amd64"
  assert.equal(
    fs.readFileSync(path.join(directory, windows), "utf8"),
    "windows binary",
  )
  assert.equal(
    fs.readFileSync(path.join(directory, linux), "utf8"),
    "linux binary",
  )
  const installer = "RoomDrop-v1.2.3-windows-arm64-setup.exe"
  fs.writeFileSync(path.join(directory, installer), "installer")
  // Simulate signing after packaging: regenerate from the final bytes.
  fs.appendFileSync(path.join(directory, windows), " signed")
  result = run("checksums")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    fs.readFileSync(path.join(directory, "SHA256SUMS.txt"), "utf8"),
    `${digest("linux binary")}  ${linux}\n` +
      `${digest("installer")}  ${installer}\n` +
      `${digest("windows binary signed")}  ${windows}\n`,
  )
})

test("rejects stale assets without replacing the existing checksums", (t) => {
  const { root, directory, run } = fixture(t)
  fs.writeFileSync(path.join(root, "bin/roomdrop.exe"), "windows binary")
  assert.equal(run("windows", "amd64").status, 0)
  const sums = fs.readFileSync(path.join(directory, "SHA256SUMS.txt"), "utf8")
  fs.writeFileSync(
    path.join(directory, "RoomDrop-v1.2.2-windows-amd64.exe"),
    "old version",
  )
  const result = run("checksums")
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unexpected release asset/)
  assert.equal(
    fs.readFileSync(path.join(directory, "SHA256SUMS.txt"), "utf8"),
    sums,
  )
})
