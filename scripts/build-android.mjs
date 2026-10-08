import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const javaHome =
  process.env.JAVA_HOME ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot"
    : path.dirname(path.dirname(fs.realpathSync("/usr/bin/java"))));
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.platform === "win32"
    ? "C:\\Users\\Alosh2\\AppData\\Local\\Android\\Sdk"
    : "/opt/android-sdk");

function findApkSigner() {
  const buildToolsDir = path.join(androidHome, "build-tools");
  if (!fs.existsSync(buildToolsDir)) return null;
  const versions = fs
    .readdirSync(buildToolsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const executable =
    process.platform === "win32" ? "apksigner.bat" : "apksigner";
  for (const version of versions) {
    const candidate = path.join(buildToolsDir, version, executable);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function verifyReleaseSignature(apkPath, env) {
  const apkSigner = findApkSigner();
  if (!apkSigner) {
    throw new Error("apksigner was not found in ANDROID_HOME/build-tools");
  }
  const output = execSync(
    `"${apkSigner}" verify --verbose --print-certs "${apkPath}"`,
    {
      encoding: "utf8",
      env,
    },
  );
  if (
    !output.includes("Verifies") ||
    !output.includes("Number of signers: 1")
  ) {
    throw new Error("Release APK signature verification failed");
  }
  return output;
}

console.log("=== Nursing AI Android Build ===");
console.log(`JAVA_HOME: ${javaHome}`);
console.log(`ANDROID_HOME: ${androidHome}`);

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH}`,
};

try {
  console.log("\n[1/4] Building local Mobile Frontend into mobile/dist...");
  const isRelease = process.argv.includes("--release");
  execSync("npm run build", {
    cwd: path.join(root, "mobile"),
    stdio: "inherit",
    env: { ...env, VITE_APP_VARIANT: isRelease ? "production" : "preview" },
  });

  console.log(
    "\n[2/4] Syncing Capacitor project (packaging mobile/dist into APK assets)...",
  );
  execSync("npx cap sync", { cwd: root, stdio: "inherit", env });

  const task = isRelease ? "assembleRelease" : "assembleDebug";

  if (
    isRelease &&
    !fs.existsSync(path.join(root, "android", "keystore.properties"))
  ) {
    throw new Error(
      "android/keystore.properties is required for a signed release build",
    );
  }

  console.log(
    `\n[3/4] Building Android ${isRelease ? "Release" : "Debug"} APK via Gradle...`,
  );
  const gradlewCmd = process.platform === "win32" ? ".\\gradlew" : "./gradlew";
  execSync(`${gradlewCmd} ${task}`, {
    cwd: path.join(root, "android"),
    stdio: "inherit",
    env,
  });

  console.log("\n[4/4] Finalizing APK artifacts...");
  if (isRelease) {
    const releaseDir = path.join(
      root,
      "android",
      "app",
      "build",
      "outputs",
      "apk",
      "release",
    );
    const files = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".apk"));
    const releaseApk = files[0];
    if (!releaseApk) {
      throw new Error("Gradle completed without producing a release APK");
    }

    const srcPath = path.join(releaseDir, releaseApk);
    verifyReleaseSignature(srcPath, env);
    const destDir = path.join(root, "public", "downloads");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const destNamed = path.join(destDir, releaseApk);
    const destLatest = path.join(destDir, "nursing-ai-latest.apk");

    fs.copyFileSync(srcPath, destNamed);
    fs.copyFileSync(srcPath, destLatest);

    const stats = fs.statSync(srcPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n========================================`);
    console.log(`Signed Production Release APK Ready:`);
    console.log(`File: ${releaseApk} (${sizeMb} MB)`);
    console.log(`Location: ${srcPath}`);
    console.log(`Web Download: public/downloads/${releaseApk}`);
    console.log(`Latest URL: /downloads/nursing-ai-latest.apk`);
    console.log(`========================================\n`);
  } else {
    console.log(
      "Debug APK location: android/app/build/outputs/apk/debug/app-debug.apk",
    );
  }
} catch (err) {
  console.error("\nAndroid build failed!", err.message);
  process.exit(1);
}
