# Nursing AI Android 1.1.0

The packaged Android client now follows the website's student workflows and API contracts. The app still bundles its interface locally and uses the official HTTPS backend; it does not load the website in a remote WebView.

## Student feature coverage

| Website workflow | Android implementation |
| --- | --- |
| Email login, registration, password recovery | Login and registration screens, recovery API, return to home after signup |
| Google login and new-user completion | System browser OAuth, existing Google completion form, encrypted short-lived app handoff, PKCE proof, device-bound session |
| Library | Shared category definitions, search, course/semester filters, pagination, recently studied sources, favorites, preview and download |
| Library sources in chat | Attach/remove sources, hydrate sources when opening existing conversations, start a conversation from a library resource |
| Subscription | Current plan, expiry, usage, plans, payment instructions, receipt upload, request states and subscription history |
| Chat and attachments | Subject selection before upload, processing polling, cancellation, ready attachment IDs, image/camera upload, Markdown, persisted message IDs, copy and feedback |
| Lecture uploads | Size limits, explicit optional sharing consent, ownership confirmation, large-file acknowledgment, duplicate detection |
| Study packs | All summary concepts/definitions/clinical notes/takeaways/references, key points, extracted pages, source-specific chat, regeneration, flashcards and quizzes |
| Quizzes | Shared answer normalization, server-side start/answer/complete lifecycle, study/exam modes, multiple-answer questions, server-owned final score |
| Learning | Flashcard progress, actual-answer mistake recovery, subject/topic/status filters, targeted review, weak/strong topics and subject progress |
| Account settings | Profile edit, study preferences, theme, platform policies, correct app version |
| Navigation | Hardware back closes sheets, quiz exit confirmation, preserved active screen during network loss, readable mobile composer |

This update covers student-facing features. Administrator management remains in the website's admin area.

## Defects corrected

- Library chips previously sent unsupported `books/guides/summaries/questions` categories. Android now imports the backend's catalog definitions.
- Chat sent a newly uploaded lecture immediately after the server returned HTTP 202. Android now waits for both `ready` and a real attachment ID; a failed/cancelled/timed-out upload cannot be sent as a ready attachment.
- Android file pickers sometimes provide a blank/generic MIME type. The backend normalizes only these generic cases for supported extensions, preserving rejection of incompatible declared types and the storage validation.
- Mobile quiz generation wrapped settings in `config`, while the backend expects top-level settings. Answer requests used `selectedOptionId` instead of `selectedAnswer`. Study-pack attempts lacked `start/answer/complete` actions, and local grading defaulted missing keys to A. These contracts now match the website.
- Flashcards sent `cardId/rating` instead of `flashcardId/status` and advanced even when saving failed. Failed writes now keep the card visible and report the error.
- Mistake review sent an arbitrary `action` rather than `studentAnswer`. Mastery now follows the backend's actual-answer recovery policy.
- The summary screen omitted the backend's concepts, definitions, clinical notes, takeaways and references.
- Registration could leave an authenticated student on an unsupported `register` screen. Successful authentication now returns to home.
- Lecture uploads silently enabled all sharing consent flags. Contributions are now explicitly optional.

## Verification

- Next.js production build and TypeScript compilation.
- Android Gradle debug build succeeded; `apksigner` verified the APK's v2 signature, and `aapt` verified preview package ID, version code 3, Android SDK 36 and the preview callback scheme.
- Full repository ESLint finished with zero errors and 56 warnings; the changed mobile/auth files passed the targeted lint check without warnings.
- All 132 repository Node integration/unit tests passed, including migration preservation, ownership, grading, library access and subscription behavior.
- Added behavior tests for document readiness/cancellation, Arabic SSE streaming/persisted message IDs, shared quiz answer normalization, authenticated encryption, PKCE handoff replay/expiry/concurrent exchange, and Google-start validation.
- Eight Playwright browser flows at mobile sizes: signup/recovery, library/favorites/preview/source chat, processed file attachment, subscription receipt payload, complete study-pack/flashcard/quiz lifecycle, 360/430px composer layout, preferences and mistake recovery.
- Browser tests use explicit API fixtures. They verify UI/request/response contracts, not live Google OAuth, bank receipt approval or production AI credentials.

## Preview and production rollout

Debug builds use `com.nursingai.app.preview`, the label **Nursing AI Preview**, and the `nursingai-preview://auth` callback. They install alongside the existing production app. They use the same official API and the existing single-device account policy still applies. A preview is a separate device identity; it cannot bypass an existing active session on another installation.

The review artifact is `public/downloads/nursing-ai-preview-v1.1.0.apk` (approximately 4.6 MB). SHA-256: `8efa5e2133dce804261fbbcaaa235e3dc3cc7b4e439b816460660d1edb7eb9ca`. This preview was built from the updated local interface, but newly added server endpoints are available only after the server changes are deployed. Existing production endpoints continue to be used for established workflows.

The production identifier remains `com.nursingai.app`, with `nursingai://auth` callbacks. Release builds use the existing signing configuration; no replacement release key was created.

1. Deploy the server changes and run the additive migration `0028_mobile_auth_handoffs.sql` with the existing migration workflow. If migration and runtime database roles differ, grant the runtime role `SELECT, INSERT, DELETE` on `public.mobile_auth_handoffs` using the deployment's existing database permission setup. Do not grant browser/public access.
2. Preserve `AUTH_SECRET`, `APP_URL`, the Google OAuth credentials, and the existing callback `APP_URL/auth/google/callback`. Google still redirects to the website; only the final short-lived code returns to the app. Device and session credentials are encrypted rather than exposed in browser URLs, and the app must prove possession of its verifier to redeem a code.
3. Smoke-test an existing Google account and a new account needing academic-year completion on a real Android device; verify cancellation, process restart and the device policy. Live Google credentials were unavailable in the coding environment.
4. Restore the **original** release keystore and `android/keystore.properties` in the trusted release environment and run `npm run cap:build:release` using Java 21 and Android SDK 36 (build-tools 35 or the version required by AGP).
5. After verifying that the APK's certificate matches the previous production release, publish the signed APK and update `mobile_app_version` to name `1.1.0`, code `3`. The old production download and update metadata are intentionally not replaced by a debug APK.

Commands:

```sh
npm ci
npm --prefix mobile ci
npm run mobile:build
npm test
npx next typegen
npx tsc --noEmit
npm run build
npm run test:mobile
npm run cap:build:debug
npm run cap:build:release
```

For Playwright, install its Chromium browser (`npx playwright install chromium`) or set `BROWSER_EXECUTABLE` to a Chromium executable. For Android, configure `JAVA_HOME` with a full JDK and `ANDROID_HOME` with the SDK. The Android build script now uses the host platform's path separator and Java location on Linux as well as the previous Windows defaults.
