$keystoreDir = Join-Path $PSScriptRoot "..\android\keystore"
if (-not (Test-Path $keystoreDir)) {
    New-Item -ItemType Directory -Path $keystoreDir -Force | Out-Null
}

$keystoreFile = Join-Path $keystoreDir "nursing-ai-release.keystore"
$propertiesFile = Join-Path $PSScriptRoot "..\android\keystore.properties"

$keystoreExists = Test-Path -LiteralPath $keystoreFile
$propertiesExist = Test-Path -LiteralPath $propertiesFile

if ($keystoreExists -and $propertiesExist) {
    Write-Host "Release keystore is already configured. Existing credentials were preserved."
    exit 0
}

if ($keystoreExists -xor $propertiesExist) {
    throw "Incomplete release signing setup. Restore both the keystore and android/keystore.properties from the secure backup; credentials cannot be regenerated for an existing key."
}

$keytoolExe = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot\bin\keytool.exe"
if (-not (Test-Path $keytoolExe)) {
    $found = Get-Command keytool -ErrorAction SilentlyContinue
    if ($found) { $keytoolExe = $found.Source }
}
if (-not (Test-Path -LiteralPath $keytoolExe)) {
    throw "keytool was not found. Install a JDK or configure keytool in PATH."
}

$passBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($passBytes)
$pass = [Convert]::ToBase64String($passBytes).Replace('/', 'a').Replace('+', 'b').Replace('=', 'c')

& $keytoolExe -genkeypair -v `
    -keystore $keystoreFile `
    -alias "nursing_ai_key" `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $pass `
    -keypass $pass `
    -dname "CN=Nursing AI, OU=Mobile, O=Nursing AI Tech, L=Baghdad, ST=Baghdad, C=IQ"
if ($LASTEXITCODE -ne 0) {
    throw "keytool failed to create the release keystore."
}

$content = "storeFile=../keystore/nursing-ai-release.keystore`nstorePassword=$pass`nkeyAlias=nursing_ai_key`nkeyPassword=$pass`n"
[System.IO.File]::WriteAllText($propertiesFile, $content)

Write-Host "Keystore created and keystore.properties configured successfully."
