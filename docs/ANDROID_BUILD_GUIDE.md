# Nursing AI - Android Capacitor Build & Release Guide

هذا الدليل يشرح كيفية بناء وتشغيل وتجهيز تطبيق **Nursing AI** لنظام **Android** باستخدام **Capacitor**.

---

## 1. المعمارية (Architecture)

- **Next.js Web Application**: يعمل كموقع إلكتروني متكامل يحتوي على Backend APIs, PostgreSQL, OpenAI, RAG Pipeline, Auth Sessions, File Uploads.
- **Capacitor Native Android Shell**: غلاف أندرويد حقيقي يلتف حول منصة Nursing AI الحالية مع ربطه بالخادم الإنتاجي.
- **إدارة الجلسات (Authentication Persistence)**: التطبيق يستخدم Supabase / HTTP-only Session Cookie المستمرة حتى بعد إغلاق التطبيق وإعادة فتحه أو الانتقال للـ Background.
- **الأمان (Security)**: جميع مفاتيح OpenAI وأسرار قاعدة البيانات تبقى دائماً في Server-Side ولا تخزن أبداً داخل APK.

---

## 2. الميزات المدمجة لـ Android

1. **Hardware Back Button**:
   - إغلاق النوافذ المنبثقة (Modals / Dialogs) فوراً.
   - الرجوع للصفحة السابقة في السجل عند التنقل.
   - تصغير/الخروج من التطبيق عند وجود الطالب في الصفحة الرئيسية (`/dashboard` / `/login`).
2. **شريط الحالة (Status Bar)**:
   - متناسق مع لون الهوية `#0f5d75` وشريط تحكم علوي غير متقاطع مع الكاميرا/القطع.
3. **شاشة البداية (Splash Screen)**:
   - مزودة بشعار Nursing AI ولون الهوية وبدون أنيميشن ثقيل.
4. **شريط الكيبورد (Keyboard Handling)**:
   - محاذات حقل كتابة المحادثة (Composer) بشكل تلقائي عند ظهور كيبورد الأندرويد بدون تغطية زر الإرسال أو المرفقات.
5. **كشف الاتصال بالشبكة (Offline Detection)**:
   - إظهار شريط تنبيه واضح عند انقطاع الإنترنت: *"لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى."* مع زر إمكانية إعادة المحاولة عند عودة الشبكة.
6. **الروابط الخارجية (External Links)**:
   - فتح الروابط الخارجية في المتصفح الخارجي للنظام للحفاظ على تجربة مستخدم سريعة داخل التطبيق.
7. **Deep Links**:
   - مهيأ لدعم رابط `nursingai://` للانتقال المباشر.

---

## 3. الأوامر البرمجية للبناء (Build Commands)

### 1) بناء نسخة الاختبار (Debug APK):
```bash
npm run cap:build:debug
```
المخرجات:
`android/app/build/outputs/apk/debug/app-debug.apk`

### 2) مزامنة التغييرات مع أندرويد:
```bash
npm run cap:sync
```

### 3) فتح المشروع في Android Studio:
```bash
npm run cap:open
```

---

## 4. خطوات إصدار تطبيق الإنتاج (Signed Release APK / AAB)

### 1) إنشاء مفتاح التوقيع (Keystore):
قم بتشغيل الأمر التالي في التيرمنال وتأكد من حفظ المفتاح وكلمة المرور في مكان آمن وعدم رفعهما إلى Git:

```bash
keytool -genkey -v -keystore android/app/release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias nursingai-key
```

> ⚠️ **ملاحظة أمنية**: ملفات `.jks` و `local.properties` مضافة تلقائيًا إلى `.gitignore` لمنع التسريب.

### 2) ضبط خيارات التوقيع في `android/app/build.gradle`:
أضف الإعدادات التالية داخل كتل `android`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file('release-key.jks')
            storePassword 'YOUR_STORE_PASSWORD'
            keyAlias 'nursingai-key'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 3) بناء Bundle المخصص لمتجر Google Play (AAB):
```bash
cd android
.\gradlew bundleRelease
```
المخرجات:
`android/app/build/outputs/bundle/release/app-release.aab`

---

## 5. تكوين البيئة للإنتاج (Production URL)

عند بناء النسخة الحقيقية، تأكد من ضبط متغير البيئة `CAPACITOR_SERVER_URL` ليشير إلى رابط سيرفر الإنتاج:

في Windows PowerShell:
```powershell
$env:CAPACITOR_SERVER_URL="https://your-nursing-ai-domain.com"
npm run cap:build:debug
```

---

## 6. بناء إصدار للاختبار اليدوي دون نشره (Staging)

```bash
npm run cap:build:release -- --stage
```

يبني ويوقّع بالمفتاح الأصلي ويتحقق من الإصدار والشهادة وعدم قابلية التنقيح، ثم يضع الملف في `release-staging/nursing-ai-v<الإصدار>.apk` مع سجل SHA-256 (`.json`). **لا يلمس** `public/downloads` فيبقى `/download` و`latest_version` على النسخة المنشورة. المجلد خارج `public/` ومتجاهَل في git.

بعد نجاح الفحص اليدوي فقط: `node scripts/build-android.mjs --release --publish-staged` يتأكد أن الملف هو نفسه الذي اختُبر (SHA-256) ثم ينسخه للنشر. تحديث إعداد `mobile_app_version` يتم في الوقت نفسه (انظر `docs/qa-book-study-1.2.1-manual-checklist.md`).
