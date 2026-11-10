import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "frontend/package.json"), "utf8"),
)
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error("Expected a numeric major.minor.patch release version.")
}

const [platform, arch, ...extra] = process.argv.slice(2)
if (
  extra.length ||
  (platform === "checksums"
    ? arch !== undefined
    : !["windows", "darwin", "linux"].includes(platform) ||
      !["amd64", "arm64"].includes(arch))
) {
  throw new Error(
    "Usage: node scripts/prepare-update.mjs <windows|darwin|linux> <amd64|arm64>, or node scripts/prepare-update.mjs checksums",
  )
}

const directory = path.join(root, "bin/release", `v${version}`)
const prefix = `RoomDrop-v${version}`
if (platform !== "checksums") {
  fs.mkdirSync(directory, { recursive: true })
  if (platform === "darwin") {
    // The package task builds both architectures into this single .app.
    // --norsrc excludes Finder metadata; the archive must contain only the .app.
    execFileSync(
      "ditto",
      [
        "-c",
        "-k",
        "--keepParent",
        "--norsrc",
        path.join(root, "bin/roomdrop.app"),
        path.join(directory, `${prefix}-macos-universal.zip`),
      ],
      { stdio: "inherit" },
    )
  } else {
    const extension = platform === "windows" ? ".exe" : ""
    const output = path.join(
      directory,
      `${prefix}-${platform}-${arch}${extension}`,
    )
    fs.copyFileSync(path.join(root, `bin/roomdrop${extension}`), output)
    if (platform === "linux") fs.chmodSync(output, 0o755)
  }
}

// Run again after collecting all platforms and optional installers/AppImages
// into this directory, so one sidecar covers the exact bytes being published.
const files = fs
  .readdirSync(directory)
  .filter((file) => file !== "SHA256SUMS.txt" && file !== "SHA256SUMS.txt.tmp")
  .sort()
if (!files.length) throw new Error("No release assets to checksum.")
const sums = []
for (const file of files) {
  if (
    !file.startsWith(`${prefix}-`) ||
    /\s/.test(file) ||
    !fs.lstatSync(path.join(directory, file)).isFile()
  ) {
    throw new Error(`Unexpected release asset: ${file}`)
  }
  const hash = createHash("sha256")
  for await (const chunk of fs.createReadStream(path.join(directory, file))) {
    hash.update(chunk)
  }
  sums.push(`${hash.digest("hex")}  ${file}\n`)
}
fs.writeFileSync(path.join(directory, "SHA256SUMS.txt.tmp"), sums.join(""))
fs.renameSync(
  path.join(directory, "SHA256SUMS.txt.tmp"),
  path.join(directory, "SHA256SUMS.txt"),
)
console.log(`Update assets and SHA256SUMS.txt: ${directory}`)
