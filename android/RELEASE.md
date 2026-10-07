# Android release

1. Keep the existing production keystore backed up securely. Every update must use the same keystore.
2. Update `mobile/app-version.json`: increase `code` and set the new semantic `name`.
3. Run `npm run cap:build:release` from the repository root.
4. Publish the generated signed APK from `public/downloads/`, then update the Android release fields in Admin → Settings.

Never commit `android/keystore.properties`, a keystore file, or any signing password.
