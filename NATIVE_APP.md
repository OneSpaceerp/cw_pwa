# C-Water Visits: the native app (Android, iOS)

The same app as `/cw`, packaged with [Capacitor](https://capacitorjs.com) so it can follow
the engineer's position in the background. The screens are the same code
(`frontend/src`); `frontend/android` is the Android project.

| | Web app (`/cw`) | Native app |
| --- | --- | --- |
| Files | served by ERPNext | inside the app |
| Sign-in | browser session cookie | device token (`cw_pwa/native.py`, CW App Device) |
| Site presence | only while open on screen | in the background too (Android foreground service) |
| Notifications | Web Push | Firebase Cloud Messaging + local reminders |

## Server

```bash
cd apps/cw_pwa && git pull && cd ../..
bench setup requirements          # google-auth, for Firebase
bench --site <site> migrate       # CW App Device
bench build --app cw_pwa
bench restart
```

Phones signed in to the app are listed under **CW App Device**. Untick *Signed In* to sign
one out. The app's origin is let through CORS only for its own API (`/api/method/cw_...`)
and private files; nothing to add to `site_config.json`.

## Build the Android app (Windows, macOS or Linux)

Needs Node 20+, Android Studio (its bundled Java is enough) and the Android SDK.

```bash
cd frontend
npm install
CW_SERVER=https://onespace.cw-eg.com npm run native:sync   # web build + copy into android/
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

Install the debug APK on a phone (`adb install -r app-debug.apk`) or open the project in
Android Studio (`npm run native:open`). For the Play Store, build a signed bundle
(`./gradlew bundleRelease` with a release keystore, or Build > Generate Signed Bundle).

App ID `com.cwater.visits` (fixed once published), name "C-Water Visits".

## Notifications (Firebase)

Native notifications need a Firebase project (free):

1. https://console.firebase.google.com > **Add project** (e.g. "C-Water Visits").
2. **Add app > Android**, package name `com.cwater.visits`. Download
   `google-services.json` into `frontend/android/app/`.
3. **Project settings > Service accounts > Generate new private key**. Copy the file to the
   server (not into git) and point the site at it:
   `bench --site <site> set-config cw_pwa_fcm_credentials /home/<user>/firebase-key.json`
4. Build with push on: `CW_NATIVE_PUSH=1 npm run native:sync`, then `./gradlew assembleDebug`.
5. iPhone: add an iOS app in the same project and upload the APNs key (Apple Developer
   account > Keys) under **Cloud Messaging**.

Without Firebase the app works; only server notifications (new visit, review result) do not
reach the phone. Local reminders (forgot to check out) work without it.

## iOS

Needs a Mac with Xcode (or a cloud Mac build service) and an Apple Developer account:

```bash
cd frontend && npm install @capacitor/ios@8.6.0 && npx cap add ios && npm run build:native && npx cap sync ios
```

Then in Xcode: Background Modes > Location updates, and the location usage descriptions
(NSLocationWhenInUseUsageDescription, NSLocationAlwaysAndWhenInUseUsageDescription) in
Info.plist.
