import { execSync } from "child_process";
import { createHash } from "crypto";
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

function findBuildTool(name) {
  const buildToolsDir = path.join(androidHome, "build-tools");
  if (!fs.existsSync(buildToolsDir)) return null;
  const versions = fs.readdirSync(buildToolsDir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    for (const candidate of [name, `${name}.exe`, `${name}.bat`]) {
      const file = path.join(buildToolsDir, version, candidate);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

/** Release gate: production identity, expected version, never debuggable. */
function verifyReleaseManifest(apkPath, expected, env) {
  const aapt2 = findBuildTool("aapt2");
  if (!aapt2) throw new Error("aapt2 was not found in ANDROID_HOME/build-tools");
  const badging = execSync(`"${aapt2}" dump badging "${apkPath}"`, { encoding: "utf8", env });
  const pkg = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  if (!pkg) throw new Error("Could not read the APK package information");
  const [, packageName, versionCode, versionName] = pkg;
  if (packageName !== "com.nursingai.app") throw new Error(`Unexpected application id ${packageName}`);
  if (Number(versionCode) !== expected.code || versionName !== expected.name)
    throw new Error(`APK version ${versionName} (${versionCode}) does not match mobile/app-version.json ${expected.name} (${expected.code})`);
  if (/application-debuggable/.test(badging)) throw new Error("Release APK is debuggable");
  return { packageName, versionCode: Number(versionCode), versionName };
}

/** Certificate digest from apksigner output; build-tools print "Signer #1" or "V2 Signer". */
function signerCertificate(output) {
  return output.match(/(?:Signer #1|V\d+ Signer):? certificate SHA-256 digest:\s*([a-f0-9]{64})/i)?.[1]?.toLowerCase();
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
  const isRelease = process.argv.includes("--release");
  // Re-run only verification and publishing for an APK Gradle already built.
  const finalizeOnly = isRelease && process.argv.includes("--finalize-only");
  if (!finalizeOnly) {
  console.log("\n[1/4] Building local Mobile Frontend into mobile/dist...");
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
  }

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
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, "mobile", "app-version.json"), "utf8"));
    const identity = verifyReleaseManifest(srcPath, expectedVersion, env);
    const signature = verifyReleaseSignature(srcPath, env);
    if (/CN=Android Debug/i.test(signature)) throw new Error("Release APK is signed with the Android debug certificate");
    const previousApk = path.join(
      root,
      "public",
      "downloads",
      "nursing-ai-latest.apk",
    );
    if (fs.existsSync(previousApk)) {
      const previousSignature = verifyReleaseSignature(previousApk, env);
      const certificate = signerCertificate;
      if (
        !certificate(signature) ||
        certificate(signature) !== certificate(previousSignature)
      ) {
        throw new Error(
          "The release certificate does not match the existing production APK. Restore the original signing key before publishing an update.",
        );
      }
    }
    const destDir = path.join(root, "public", "downloads");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const publishedName = `nursing-ai-v${identity.versionName}.apk`;
    const destNamed = path.join(destDir, publishedName);
    const destLatest = path.join(destDir, "nursing-ai-latest.apk");

    fs.copyFileSync(srcPath, destNamed);
    fs.copyFileSync(srcPath, destLatest);

    const stats = fs.statSync(srcPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    const sha256 = createHash("sha256").update(fs.readFileSync(srcPath)).digest("hex");
    const certificate = signerCertificate(signature);

    console.log(`\n========================================`);
    console.log(`Signed Production Release APK Ready:`);
    console.log(`Package: ${identity.packageName} ${identity.versionName} (${identity.versionCode}), not debuggable`);
    console.log(`File: ${publishedName} (${sizeMb} MB)`);
    console.log(`APK SHA-256: ${sha256}`);
    console.log(`Signing certificate SHA-256: ${certificate}`);
    console.log(`Web Download: public/downloads/${publishedName}`);
    console.log(`Latest URL: /api/download/apk (public/downloads/nursing-ai-latest.apk)`);
    console.log(`Publish: set version ${identity.versionName}, code ${identity.versionCode} and this SHA-256 in Admin -> Settings.`);
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
