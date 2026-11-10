import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repository = fileURLToPath(new URL("../", import.meta.url))
const targets = [
  "frontend/package-lock.json",
  "build/config.yml",
  "build/windows/info.json",
  "build/windows/wails.exe.manifest",
  "build/windows/nsis/wails_tools.nsh",
  "build/windows/msix/app_manifest.xml",
  "build/windows/msix/template.xml",
  "build/darwin/Info.plist",
  "build/darwin/Info.dev.plist",
  "build/linux/nfpm/nfpm.yaml",
]

function fixture(t, version = "1.2.3") {
  const tempRoot = path.resolve(os.tmpdir())
  const root = fs.mkdtempSync(path.join(tempRoot, "roomdrop-version-"))
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), tempRoot)
    fs.rmSync(root, { recursive: true, force: true })
  })
  for (const file of [
    "scripts/sync-version.mjs",
    "frontend/package.json",
    ...targets,
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.copyFileSync(path.join(repository, file), path.join(root, file))
  }
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
  const write = (file, content) =>
    fs.writeFileSync(path.join(root, file), content)
  const pkg = JSON.parse(read("frontend/package.json"))
  const previous = pkg.version
  write(
    "frontend/package.json",
    JSON.stringify({ ...pkg, version }, null, 2) + "\n",
  )
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [path.join(root, "scripts/sync-version.mjs"), ...args],
      { cwd: root, encoding: "utf8" },
    )
  return { root, read, write, run, previous }
}

test("a source version bump updates every platform and preserves unrelated metadata", (t) => {
  const { read, run, previous } = fixture(t)
  const before = new Map(targets.map((file) => [file, read(file)]))
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  for (const file of targets.filter(
    (file) => !file.endsWith("package-lock.json"),
  )) {
    assert.equal(
      read(file),
      before.get(file).replaceAll(previous, "1.2.3"),
      file,
    )
  }
  const expectedLock = JSON.parse(before.get("frontend/package-lock.json"))
  expectedLock.version = "1.2.3"
  expectedLock.packages[""].version = "1.2.3"
  assert.deepEqual(JSON.parse(read("frontend/package-lock.json")), expectedLock)
  assert.equal(JSON.parse(read("frontend/package.json")).version, "1.2.3")
  assert.equal(run("--check").status, 0)
})

test("check mode detects drift without writing and a synchronized run leaves files untouched", (t) => {
  const { root, read, run } = fixture(t)
  const before = targets.map(read)
  const result = run("--check")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /out of date/)
  assert.deepEqual(targets.map(read), before)
  assert.equal(run().status, 0)
  const timestamp = new Date("2000-01-01T00:00:00Z")
  for (const file of targets)
    fs.utimesSync(path.join(root, file), timestamp, timestamp)
  assert.equal(run().status, 0)
  for (const file of targets) {
    assert.equal(
      fs.statSync(path.join(root, file)).mtimeMs,
      timestamp.getTime(),
      file,
    )
  }
})

test("invalid native versions fail before changing metadata", (t) => {
  for (const version of ["1.2.3-beta.1", "65536.0.0", "1.02.3"]) {
    const { read, run } = fixture(t, version)
    const before = targets.map(read)
    const result = run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /numeric major.minor.patch/)
    assert.deepEqual(targets.map(read), before)
  }
})

test("an unexpected packaging layout fails before any metadata is written", (t) => {
  const { read, write, run } = fixture(t)
  const file = "build/linux/nfpm/nfpm.yaml"
  write(file, read(file).replace(/^version:/m, "missing-version:"))
  const before = targets.map(read)
  const result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Expected 1 version fields/)
  assert.deepEqual(targets.map(read), before)
})

test(
  "npm version runs synchronization through its lifecycle hook",
  { skip: !process.env.npm_execpath },
  (t) => {
    const { root, read, run } = fixture(t)
    const result = spawnSync(
      process.execPath,
      [process.env.npm_execpath, "version", "2.3.4", "--no-git-tag-version"],
      {
        cwd: path.join(root, "frontend"),
        encoding: "utf8",
      },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(read("frontend/package.json")).version, "2.3.4")
    assert.match(result.stdout, /version metadata is synchronized/)
    assert.equal(run("--check").status, 0)
  },
)
