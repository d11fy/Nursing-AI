import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = process.cwd();
const javaHome = process.env.JAVA_HOME || "C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot";
const androidHome = process.env.ANDROID_HOME || "C:\\Users\\Alosh2\\AppData\\Local\\Android\\Sdk";

console.log("=== Nursing AI Android Build ===");
console.log(`JAVA_HOME: ${javaHome}`);
console.log(`ANDROID_HOME: ${androidHome}`);

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  PATH: `${javaHome}\\bin;${process.env.PATH}`,
};

try {
  console.log("\n[1/3] Syncing Capacitor project...");
  execSync("npx cap sync", { cwd: root, stdio: "inherit", env });

  const isRelease = process.argv.includes("--release");
  const task = isRelease ? "assembleRelease" : "assembleDebug";

  console.log(`\n[2/3] Building Android ${isRelease ? "Release" : "Debug"} APK via Gradle...`);
  const gradlewCmd = process.platform === "win32" ? ".\\gradlew" : "./gradlew";
  execSync(`${gradlewCmd} ${task}`, { cwd: path.join(root, "android"), stdio: "inherit", env });

  console.log("\n[3/3] Build completed successfully!");
  if (isRelease) {
    console.log("Release APK location: android/app/build/outputs/apk/release/app-release-unsigned.apk");
  } else {
    console.log("Debug APK location: android/app/build/outputs/apk/debug/app-debug.apk");
  }
} catch (err) {
  console.error("\nAndroid build failed!", err.message);
  process.exit(1);
}
