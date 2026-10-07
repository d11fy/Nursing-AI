$keystoreDir = Join-Path $PSScriptRoot "..\android\keystore"
if (-not (Test-Path $keystoreDir)) {
    New-Item -ItemType Directory -Path $keystoreDir -Force | Out-Null
}

$keystoreFile = Join-Path $keystoreDir "nursing-ai-release.keystore"
$propertiesFile = Join-Path $PSScriptRoot "..\android\keystore.properties"

$keytoolExe = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot\bin\keytool.exe"
if (-not (Test-Path $keytoolExe)) {
    $found = Get-Command keytool -ErrorAction SilentlyContinue
    if ($found) { $keytoolExe = $found.Source }
}

$passBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($passBytes)
$pass = [Convert]::ToBase64String($passBytes).Replace('/', 'a').Replace('+', 'b').Replace('=', 'c')

if (-not (Test-Path $keystoreFile)) {
    & $keytoolExe -genkeypair -v `
        -keystore $keystoreFile `
        -alias "nursing_ai_key" `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass $pass `
        -keypass $pass `
        -dname "CN=Nursing AI, OU=Mobile, O=Nursing AI Tech, L=Baghdad, ST=Baghdad, C=IQ"
}

$content = "storeFile=../keystore/nursing-ai-release.keystore`nstorePassword=$pass`nkeyAlias=nursing_ai_key`nkeyPassword=$pass`n"
[System.IO.File]::WriteAllText($propertiesFile, $content)

Write-Host "Keystore created and keystore.properties configured successfully."
