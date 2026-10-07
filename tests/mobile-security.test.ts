import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { isAllowedApiOrigin } from "../lib/http/cors";
import { proxy } from "../proxy";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("mobile CORS accepts only the website and the Capacitor origin", () => {
  const requestOrigin = "https://nursing.alisohail.tech";
  assert.equal(isAllowedApiOrigin(null, requestOrigin), true);
  assert.equal(isAllowedApiOrigin(requestOrigin, requestOrigin), true);
  assert.equal(isAllowedApiOrigin("https://localhost", requestOrigin), true);
  assert.equal(isAllowedApiOrigin("capacitor://localhost", requestOrigin), true);
  assert.equal(isAllowedApiOrigin("https://evil.example", requestOrigin), false);
  assert.equal(isAllowedApiOrigin("http://localhost", requestOrigin), false);
});

test("proxy rejects untrusted preflights and permits the exact Capacitor origin", async () => {
  const denied = await proxy(new NextRequest("https://nursing.alisohail.tech/api/profile", {
    method: "OPTIONS",
    headers: { origin: "https://evil.example" },
  }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);

  const allowed = await proxy(new NextRequest("https://nursing.alisohail.tech/api/profile", {
    method: "OPTIONS",
    headers: { origin: "https://localhost" },
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://localhost");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), null);
});

test("production Android networking and API host are locked down", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const capacitorConfig = read("capacitor.config.ts");
  const mobileApi = read("mobile/src/services/api.ts");
  const loginScreen = read("mobile/src/screens/LoginScreen.tsx");
  const settingsScreen = read("mobile/src/screens/SettingsScreen.tsx");
  const versionRoute = read("app/api/app/version/route.ts");

  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /FileProvider/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|READ_MEDIA_IMAGES/);
  assert.match(manifest, /android\.hardware\.camera" android:required="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(capacitorConfig, /cleartext: false/);
  assert.doesNotMatch(capacitorConfig, /server\s*:\s*\{[\s\S]*?url\s*:/);
  assert.doesNotMatch(capacitorConfig, /allowNavigation/);
  assert.doesNotMatch(mobileApi, /setServerUrl/);
  assert.doesNotMatch(loginScreen, /setServerUrl|serverUrlInput/);
  assert.doesNotMatch(settingsScreen, /setServerUrl/);
  assert.match(mobileApi, /API endpoint must be a local \/api\/ path/);
  assert.match(mobileApi, /res\.status === 401/);
  assert.match(mobileApi, /nursing:auth-expired/);
  assert.match(mobileApi, /resolved\.origin !== new URL\(DEFAULT_SERVER_URL\)\.origin/);
  assert.doesNotMatch(versionRoute, /Access-Control-Allow-Origin.*\*/);
});

test("release builds require signing, verify the APK, and enable R8", () => {
  const gradle = read("android/app/build.gradle");
  const buildScript = read("scripts/build-android.mjs");
  const setupScript = read("scripts/setup-release-keystore.ps1");

  assert.match(gradle, /minifyEnabled true/);
  assert.match(gradle, /shrinkResources true/);
  assert.match(gradle, /Release signing is required/);
  assert.match(buildScript, /verifyReleaseSignature/);
  assert.match(buildScript, /Number of signers: 1/);
  assert.match(setupScript, /Existing credentials were preserved/);
  assert.match(setupScript, /Incomplete release signing setup/);
});
