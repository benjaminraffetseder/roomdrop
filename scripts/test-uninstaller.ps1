[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$binary = Join-Path $repository 'bin/roomdrop.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw 'Run wails3 build for this Windows architecture first.' }
$architecture = switch ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
    'X64' { 'amd64' }
    'Arm64' { 'arm64' }
    default { throw 'This test requires Windows x64 or ARM64.' }
}
$id = [guid]::NewGuid().ToString('N')
$projectName = "RoomDrop-Uninstall-Test-$id"
$fixture = Join-Path $repository "bin/uninstaller-tests/$id"
if (-not $fixture.StartsWith((Join-Path $repository 'bin/'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test destination.' }
New-Item -ItemType Directory -Path (Join-Path $fixture 'personal') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fixture 'keep-me.txt') -Value 'Unrelated top-level file'
Set-Content -LiteralPath (Join-Path $fixture 'personal/keep-me.txt') -Value 'Unrelated nested file'
$before = @(Get-FileHash -LiteralPath (Join-Path $fixture 'keep-me.txt'), (Join-Path $fixture 'personal/keep-me.txt'))

Push-Location (Join-Path $repository 'build/windows/nsis')
try {
    $flag = if ($architecture -eq 'amd64') { 'AMD64' } else { 'ARM64' }
    & makensis '-V1' '-DWAILS_INSTALL_SCOPE=user' '-DREQUEST_EXECUTION_LEVEL=user' '-DWAILS_SKIP_WEBVIEW2' "-DINFO_PROJECTNAME=$projectName" "-DINFO_PRODUCTNAME=$projectName" "-DUNINST_KEY_NAME=$projectName" "-DARG_WAILS_${flag}_BINARY=$binary" 'project.nsi'
    if ($LASTEXITCODE -ne 0) { throw 'Could not compile the sandbox installer.' }
} finally { Pop-Location }

$installer = Join-Path $repository "bin/$projectName-$architecture-installer.exe"
$installed = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$fixture") -Wait -PassThru -WindowStyle Hidden
if ($installed.ExitCode -ne 0) { throw "Sandbox install failed: $($installed.ExitCode)" }
if (-not (Test-Path -LiteralPath (Join-Path $fixture "$projectName.exe"))) { throw 'Test executable was not installed.' }
foreach ($notice in @('RoomDrop-LICENSE.txt', 'RoomDrop-THIRD-PARTY-NOTICES.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $fixture $notice))) { throw "Missing installed notice: $notice" }
}
$uninstalled = Start-Process -FilePath (Join-Path $fixture 'uninstall.exe') -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
if ($uninstalled.ExitCode -ne 0) { throw "Sandbox uninstall failed: $($uninstalled.ExitCode)" }
foreach ($ownedFile in @("$projectName.exe", 'uninstall.exe', 'RoomDrop-LICENSE.txt', 'RoomDrop-THIRD-PARTY-NOTICES.txt')) {
    if (Test-Path -LiteralPath (Join-Path $fixture $ownedFile)) { throw "Installed file was not removed: $ownedFile" }
}
foreach ($file in $before) {
    if (-not (Test-Path -LiteralPath $file.Path)) { throw "Uninstall deleted an unrelated file: $($file.Path)" }
    if ((Get-FileHash -LiteralPath $file.Path).Hash -ne $file.Hash) { throw 'Uninstall changed an unrelated file.' }
}
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$projectName"
if (Test-Path -LiteralPath $uninstallKey) { throw 'Sandbox uninstall registration was not removed.' }
Write-Output 'Uninstaller removed its own files and preserved unrelated files and folders.'
