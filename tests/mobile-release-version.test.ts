import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import {
  getAppVersionInfo,
  setAppVersionInfo,
  DEFAULT_APP_VERSION,
} from "../lib/version/app-version";

const db = new PGlite({ extensions: { vector } });
const query = async (sql: string, values?: unknown[]) => {
  if (!values && (sql.includes(";") || sql.includes("--"))) {
    await db.exec(sql);
    return { rows: [] };
  }
  return db.query(sql, values);
};

before(async () => {
  process.env.DATABASE_URL = "postgresql://version-test";
  Object.assign(globalThis, {
    nursingPool: {
      query,
      connect: async () => ({ query, release() {} }),
    },
  });
  await migrate({ query });
});

after(() => db.close());

test("Android and in-app update UI share one version source", () => {
  const root = process.cwd();
  const source = JSON.parse(
    fs.readFileSync(path.join(root, "mobile", "app-version.json"), "utf8"),
  );
  const gradle = fs.readFileSync(
    path.join(root, "android", "app", "build.gradle"),
    "utf8",
  );
  const mobileConfig = fs.readFileSync(
    path.join(root, "mobile", "src", "config", "version.ts"),
    "utf8",
  );

  assert.equal(source.name, "1.2.0");
  assert.equal(source.code, 5);
  assert.match(gradle, /mobile\/app-version\.json/);
  assert.match(gradle, /versionCode appVersion\.code/);
  assert.match(gradle, /versionName appVersion\.name/);
  assert.match(mobileConfig, /app-version\.json/);
});

test("mobile version system: defaults and settings persistence", async () => {
  const initial = await getAppVersionInfo();
  assert.equal(typeof initial.latest_version, "string");
  assert.equal(typeof initial.latest_version_code, "number");
  assert.ok(initial.apk_url.length > 0);

  // Update version info (simulate bumping to 1.0.1)
  const updated = await setAppVersionInfo({
    latest_version: "1.0.1",
    latest_version_code: 2,
    release_notes: "تحسينات في الأداء والتخزين العتادي المشفر",
    force_update: false,
  });

  assert.equal(updated.latest_version, "1.0.1");
  assert.equal(updated.latest_version_code, 2);
  assert.equal(updated.force_update, false);

  const reRead = await getAppVersionInfo();
  assert.equal(reRead.latest_version, "1.0.1");
  assert.equal(reRead.latest_version_code, 2);

  // Reset back to 1.0.0 for v1.0.0 baseline release
  await setAppVersionInfo({
    latest_version: "1.0.0",
    latest_version_code: 1,
    release_notes: DEFAULT_APP_VERSION.release_notes,
    force_update: false,
  });
  const restored = await getAppVersionInfo();
  assert.equal(restored.latest_version, "1.0.0");
  assert.equal(restored.latest_version_code, 1);
});

test("signed production APK: files exist and have valid digital signature", async () => {
  const root = process.cwd();
  const v1Path = path.join(
    root,
    "public",
    "downloads",
    "nursing-ai-v1.0.1.apk",
  );
  const latestPath = path.join(
    root,
    "public",
    "downloads",
    "nursing-ai-latest.apk",
  );
  assert.ok(
    fs.existsSync(v1Path),
    "public/downloads/nursing-ai-v1.0.1.apk exists",
  );
  assert.ok(
    fs.existsSync(latestPath),
    "public/downloads/nursing-ai-latest.apk exists",
  );

  const stat = fs.statSync(v1Path);
  assert.ok(stat.size > 750 * 1024, "minified APK size is healthy (> 750KB)");

  const apkBytes = fs.readFileSync(v1Path);
  assert.notEqual(
    apkBytes.indexOf(Buffer.from("APK Sig Block 42")),
    -1,
    "APK contains a v2+ signing block even when Android SDK tools are unavailable",
  );

  // Perform cryptographic verification when the Android SDK is available.
  const androidHome =
    process.env.ANDROID_HOME ||
    "C:\\Users\\Alosh2\\AppData\\Local\\Android\\Sdk";
  const buildToolsRoot = path.join(androidHome, "build-tools");
  const versions = fs.existsSync(buildToolsRoot)
    ? fs
        .readdirSync(buildToolsRoot)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : [];
  const executable =
    process.platform === "win32" ? "apksigner.bat" : "apksigner";
  const apksigner = versions
    .map((version) => path.join(buildToolsRoot, version, executable))
    .find((candidate) => fs.existsSync(candidate));
  if (apksigner) {
    const output = execSync(`"${apksigner}" verify --verbose "${v1Path}"`, {
      encoding: "utf-8",
    });
    assert.match(output, /Verifies/, "APK signature verification passes");
    assert.match(
      output,
      /Verified using v2 scheme \(APK Signature Scheme v2\): true/,
    );
  }
});

test("version comparison logic detects newer releases and force update flag", () => {
  function checkShouldUpdate(
    currentCode: number,
    latestCode: number,
    force: boolean,
  ) {
    return {
      hasUpdate: latestCode > currentCode,
      mustForce: latestCode > currentCode && force,
    };
  }

  // Same version
  const checkSame = checkShouldUpdate(1, 1, false);
  assert.equal(checkSame.hasUpdate, false);
  assert.equal(checkSame.mustForce, false);

  // New optional version (1.0.1)
  const checkOptional = checkShouldUpdate(1, 2, false);
  assert.equal(checkOptional.hasUpdate, true);
  assert.equal(checkOptional.mustForce, false);

  // New mandatory version
  const checkForced = checkShouldUpdate(1, 2, true);
  assert.equal(checkForced.hasUpdate, true);
  assert.equal(checkForced.mustForce, true);
});

test("1.2.0 release keeps the production signing identity and is not debuggable", () => {
  const root = process.cwd();
  const androidHome = process.env.ANDROID_HOME || path.join("C:", "Users", "Alosh2", "AppData", "Local", "Android", "Sdk");
  const buildToolsRoot = path.join(androidHome, "build-tools");
  const versions = fs.existsSync(buildToolsRoot)
    ? fs.readdirSync(buildToolsRoot).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : [];
  const tool = (name: string) => versions.flatMap((version) => [name, `${name}.exe`, `${name}.bat`]
    .map((file) => path.join(buildToolsRoot, version, file))).find((candidate) => fs.existsSync(candidate));
  const apksigner = tool("apksigner"), aapt2 = tool("aapt2");
  const release = path.join(root, "public", "downloads", "nursing-ai-v1.2.0.apk");
  const official = path.join(root, "public", "downloads", "nursing-ai-v1.0.1.apk");
  assert.ok(fs.existsSync(release), "the signed 1.2.0 APK is published");
  if (!apksigner || !aapt2) return; // Verified on machines with the Android SDK.
  const certificate = (file: string) => execSync(`"${apksigner}" verify --print-certs "${file}"`, { encoding: "utf-8" })
    .match(/certificate SHA-256 digest:\s*([a-f0-9]{64})/i)?.[1];
  assert.equal(certificate(release), certificate(official), "same certificate: installs as an update over 1.0.x");
  assert.equal(certificate(release), "abe0a4ab3f70a62fe44132b9b49694f40a139e7c95c9b9a0861e0ef67bfe2fc8");
  const badging = execSync(`"${aapt2}" dump badging "${release}"`, { encoding: "utf-8" });
  assert.match(badging, /package: name='com\.nursingai\.app' versionCode='5' versionName='1\.2\.0'/);
  assert.doesNotMatch(badging, /application-debuggable/);
});
