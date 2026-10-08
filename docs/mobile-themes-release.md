# Android 1.1.1: appearance and release readiness

The app opens in light mode by default. The palette button at the top of the login screen and authenticated screens opens a mobile sheet with light, dark and device-controlled appearance, plus teal, blue and violet accents. Settings exposes the same choices. Changes apply immediately and persist on this installation after restart. Device color-scheme changes affect appearance only in device-controlled mode.

Dark mode uses neutral surfaces with readable text, controls, Markdown code blocks and tables. Accent backgrounds and accent text have separate dark-mode colors. Android status-bar icons/background and supported keyboard appearance follow the selected theme. The theme sheet renders in a portal so that the header's backdrop filter cannot trap it outside the viewport.

## Validation

- Mobile TypeScript/Vite compilation and Android Gradle debug packaging.
- Mobile Playwright flows include theme selection, accent selection, persistence after reload, explicit light mode on a dark device, live device-scheme changes and appearance before login, alongside the existing library/chat/subscription/study workflows. Browser API flows use fixtures rather than live Google or payment approval.
- Eleven focused Node checks cover version alignment, mobile security, release-signing requirements and UI regressions.
- Targeted ESLint and root TypeScript checks.

## Official release

Version name is `1.1.1`, code `4`. The production package identifier remains `com.nursingai.app`. No official release APK was generated because this environment does not have the original release keystore or `android/keystore.properties`.

The existing official APK's certificate SHA-256 is `abe0a4ab3f70a62fe44132b9b49694f40a139e7c95c9b9a0861e0ef67bfe2fc8`. The Android debug certificate differs. The release build now compares the new certificate against `public/downloads/nursing-ai-latest.apk` before copying release artifacts, rejecting a different signing identity.

Restore the original signing files in the trusted build environment, then run `npm run cap:build:release` with Java 21 and Android SDK 36. Do not generate a new keystore for an update to the installed production app. After the signed APK is verified, publish it, update the production version metadata and change the website download page to the official artifact. Its current preview label is intentional until signing is complete.

The separately signed validation artifact is `public/downloads/nursing-ai-preview-v1.1.1.apk`. It retains the previous preview signing identity and can update that preview installation. It is not an update to the installed production package.
