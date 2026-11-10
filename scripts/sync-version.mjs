import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
const { version } = JSON.parse(read("frontend/package.json"))
if (
  typeof version !== "string" ||
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
  version.split(".").some((part) => Number(part) > 65535)
) {
  throw new Error(
    "frontend/package.json must use a numeric major.minor.patch version with each part at most 65535 for native packaging.",
  )
}

const args = process.argv.slice(2)
if (args.some((arg) => arg !== "--check")) {
  throw new Error("Usage: node scripts/sync-version.mjs [--check]")
}
const updates = []
function update(file, transform) {
  const before = read(file)
  const after = transform(before)
  if (before !== after) updates.push({ file, after })
}

// Update only version fields, preserving custom packaging settings and formatting.
function replace(file, pattern, value, expected = 1) {
  update(file, (content) => {
    let matches = 0
    const result = content.replace(pattern, (_, prefix, suffix) => {
      matches++
      return prefix + value + suffix
    })
    if (matches !== expected) {
      throw new Error(
        `Expected ${expected} version fields in ${file}, found ${matches}.`,
      )
    }
    return result
  })
}

update("frontend/package-lock.json", (content) => {
  const lock = JSON.parse(content)
  lock.version = version
  lock.packages[""].version = version
  const result = JSON.stringify(lock, null, 2) + "\n"
  return content.includes("\r\n") ? result.replace(/\n/g, "\r\n") : result
})
replace("build/config.yml", /(^  version: ")[^"]+("\r?$)/gm, version)
replace(
  "build/windows/info.json",
  /("(?:file_version|product_version|FileVersion|ProductVersion)"\s*:\s*")[^"]+(")/g,
  version,
  4,
)
replace(
  "build/windows/wails.exe.manifest",
  /(<assemblyIdentity[^>]* name="io\.roomdrop\.app" version=")[^"]+(")/g,
  version,
)
replace(
  "build/windows/nsis/wails_tools.nsh",
  /(!define INFO_PRODUCTVERSION ")[^"]+(")/g,
  version,
)
for (const file of ["app_manifest.xml", "template.xml"]) {
  replace(
    `build/windows/msix/${file}`,
    /(\bVersion=")[^"]+(")/g,
    `${version}.0`,
  )
}
for (const file of ["Info.plist", "Info.dev.plist"]) {
  replace(
    `build/darwin/${file}`,
    /(<key>CFBundle(?:ShortVersionString|Version)<\/key>\s*<string>)[^<]+(<\/string>)/g,
    version,
    2,
  )
}
replace("build/linux/nfpm/nfpm.yaml", /(^version: ")[^"]+("\r?$)/gm, version)

// Validate every target before writing any of them.
if (args.includes("--check") && updates.length) {
  console.error(
    `Version metadata is out of date: ${updates.map(({ file }) => file).join(", ")}. Run node scripts/sync-version.mjs.`,
  )
  process.exitCode = 1
} else {
  if (!args.includes("--check")) {
    for (const { file, after } of updates) {
      fs.writeFileSync(path.join(root, file), after)
    }
  }
  console.log(`RoomDrop ${version}: version metadata is synchronized.`)
}
