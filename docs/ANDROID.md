# Tiny Kingdom Defender: Android app

Like the iOS app, the Android app is a [Capacitor](https://capacitorjs.com) wrapper around the
same single-file game build, in `android/`, with real **Unity Ads**.

| | |
|---|---|
| Store name (Play Console) | Tiny Kingdom Defender |
| App name (home screen) | Tiny Kingdom (the full name would be cut off under the icon) |
| Package name (application ID) | `com.politecarrot.tinykingdomdefender` |
| Minimum Android | 7.0 (API 24); targets API 36 |
| Unity Ads SDK | `com.unity3d.ads:unity-ads:4.20.1` (from Maven Central) |
| Unity Game ID | `800404140` (`UNITY_ADS.android` in `src/data/ads.ts`) |
| Rewarded placement | `BP_Rewarded_Android` (shared by every "▶ AD" button) |
| Interstitial placement | `BP_Interstitial_Android` (checkpoints only) |

## 1. Add the Android app in Unity

In the Unity Dashboard: **Monetization > Apps > Add app**, choose **Android**, name it Tiny Kingdom
and, once it's on Google Play, link it to the store listing (until then pick "not yet published").
Unity creates a Game ID and two placements for it. Copy them into `src/data/ads.ts`:

```ts
android: { gameId: '<Android Game ID>', rewarded: '<rewarded placement>', interstitial: '<interstitial placement>' },
```

These are filled in: Game ID `800404140`, rewarded `BP_Rewarded_Android`, interstitial
`BP_Interstitial_Android`. Once the app is on Google Play, add its Store ID to the Unity app
(**Apps > Tiny Kingdom Defender > Add Store ID**).

## 2. Build it

You need **Android Studio** (it brings the Android SDK and a JDK) on Mac, Windows or Linux.

```sh
npm install
npm run android:sync     # builds the game and copies it into android/
npm run android:open     # opens the project in Android Studio
```

In Android Studio, press Run to try it on a phone or emulator (plug the phone in with USB
debugging on). Run `npm run android:sync` again after any change to the game.

## 3. The Play Store bundle (.aab)

Google Play wants a signed **Android App Bundle**. Make an upload key once and keep it safe; you
need the same key for every update:

```sh
keytool -genkey -v -keystore android/upload-key.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties` (it's in `.gitignore`, so it never reaches GitHub):

```properties
storeFile=upload-key.jks
storePassword=<the password you chose>
keyAlias=upload
keyPassword=<the password you chose>
```

Build the bundle with `npm run android:bundle` (or **Build > Generate Signed App Bundle** in
Android Studio). It lands in `android/app/build/outputs/bundle/release/app-release.aab`, ready to
upload in the Play Console. Raise `versionCode` (and `versionName`) in `android/app/build.gradle`
for each new upload.

## Before release

- **Test ads**: testers turn on developer mode (tap the version number on the main menu five times,
  then reopen the app) to get Unity's test ads; players always get real ads. See docs/IOS.md.
- **Personalised ads**: the app asks on first launch and has a Settings toggle; the answer goes to
  Unity as consent. In the Play Console's Data safety form, say ads can be personalised with consent.
- **Play Console**: fill in the Data safety form (third-party ads; Unity collects device and usage
  data), the content rating, and "Contains ads: Yes".
- Saves use native storage on Android too (`@capacitor/preferences`), the same as on iOS.
- The app runs full screen; the status and navigation bars come back with a swipe.
