# Android release

1. Keep the existing production keystore backed up securely. Every update must use the same keystore
   (certificate SHA-256 `abe0a4ab3f70a62fe44132b9b49694f40a139e7c95c9b9a0861e0ef67bfe2fc8`).
2. Update `mobile/app-version.json`: increase `code` and set the new semantic `name`.
3. Run `npm run cap:build:release` from the repository root. The script refuses to publish an APK that is
   debuggable, has another application id, does not match `app-version.json`, is debug-signed, or is signed
   with a different certificate than `public/downloads/nursing-ai-latest.apk`.
   If Gradle succeeded but the publish step failed, `node scripts/build-android.mjs --release --finalize-only`
   re-runs only verification and publishing.
4. The script prints the APK SHA-256. Publish the version, version code and that SHA-256 in
   Admin → Settings (or a migration, as 0029 does for 1.2.0). The download route refuses to serve a file whose
   checksum differs from the published one, and the app's update check ignores it.
5. Commit `public/downloads/nursing-ai-v<version>.apk` and `nursing-ai-latest.apk` together with the
   metadata change, then run `docs/android-device-qa-checklist.md` on two real devices.

Never commit `android/keystore.properties`, a keystore file, or any signing password.
