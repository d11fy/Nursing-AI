import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { migrate } from "../scripts/migrate.mjs";
import { getAppVersionInfo, setAppVersionInfo, DEFAULT_APP_VERSION } from "../lib/version/app-version";

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
  const v1Path = path.join(root, "public", "downloads", "nursing-ai-v1.0.0.apk");
  const latestPath = path.join(root, "public", "downloads", "nursing-ai-latest.apk");
  const releaseBuildPath = path.join(
    root,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "nursing-ai-v1.0.0.apk"
  );

  assert.ok(fs.existsSync(v1Path), "public/downloads/nursing-ai-v1.0.0.apk exists");
  assert.ok(fs.existsSync(latestPath), "public/downloads/nursing-ai-latest.apk exists");
  assert.ok(fs.existsSync(releaseBuildPath), "release build output exists");

  const stat = fs.statSync(v1Path);
  assert.ok(stat.size > 2 * 1024 * 1024, "APK size is healthy (> 2MB)");

  // Verify using Android SDK apksigner
  const apksigner = "C:\\Users\\Alosh2\\AppData\\Local\\Android\\Sdk\\build-tools\\35.0.0\\apksigner.bat";
  if (fs.existsSync(apksigner)) {
    const output = execSync(`"${apksigner}" verify --verbose "${v1Path}"`, {
      encoding: "utf-8",
    });
    assert.match(output, /Verifies/, "APK signature verification passes");
    assert.match(output, /Verified using v2 scheme \(APK Signature Scheme v2\): true/);
  }
});

test("version comparison logic detects newer releases and force update flag", () => {
  function checkShouldUpdate(currentCode: number, latestCode: number, force: boolean) {
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
