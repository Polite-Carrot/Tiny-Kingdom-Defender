# Tiny Kingdom Defender: iOS app

The iOS app is a [Capacitor](https://capacitorjs.com) wrapper around the same single-file game
build that GitHub Pages serves. It lives in `ios/`, with real **Unity Ads** in place of the mock
ads the website uses.

| | |
|---|---|
| Store name (App Store Connect) | Tiny Kingdom Defender |
| App name (home screen) | Tiny Kingdom (the full name would be cut off under the icon) |
| Bundle ID | `com.politecarrot.tinykingdom` |
| Unity Game ID | `800404139` |
| Rewarded placement | `BP_Rewarded_iOS` (shared by every "▶ AD" button) |
| Interstitial placement | `BP_Interstitial_iOS` (checkpoints only) |
| Minimum iOS | 15.0, iPhone and iPad |
| Google Analytics | Firebase project `tiny-kingdom-defender`, config in `ios/App/App/GoogleService-Info.plist` (only sends after "Send usage data" is switched on) |

The ad IDs and the test-mode switch are in `src/data/ads.ts` (`UNITY_ADS`).

## Building on a Mac

You need a Mac with **Xcode** and **Node.js**. Native libraries come in through **Swift Package
Manager** (as in Color Match & Merge), so CocoaPods is not needed: `ios/App/CapApp-SPM/Package.swift`
is written by `cap sync` and lists Capacitor, Preferences, Firebase Analytics and the shared
`@politecarrot/capacitor-unity-ads` plugin (which brings in the Unity Ads SDK). Package versions are
pinned in `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.

```sh
npm install
npm run ios:sync      # builds the game, copies it into the app and updates CapApp-SPM/Package.swift
npm run ios:open      # opens ios/App/App.xcodeproj in Xcode (it resolves the Swift packages)
```

In Xcode: select the **App** target, then **Signing & Capabilities**, and pick your Apple
Developer team. Plug in your iPhone or iPad, choose it as the run destination and press Run.

Run `npm run ios:sync` again after any change to the game.

## Saves

In the app, the save lives in iOS's own storage for the app (UserDefaults, through
`@capacitor/preferences`) instead of only in the web view's localStorage, which iOS can clear to
free up space. `src/core/DurableStorage.ts` loads it at start-up and every save is written to both
(localStorage stays as a fallback copy). The first time a player opens a build with this, any save
already in the web view is carried over. The website keeps using localStorage as before.

## Ads: test ads for testers, real ads for players

Players get real ads. To test, turn on **developer mode**: tap the version number (top left of
the main menu) five times, then close and reopen the app. While it's on, the app shows Unity's
test ads and Settings shows the developer options; tap five times again to turn it off. Tapping
real ads on your own device can get the Unity account flagged, so always test in developer
mode. You can also register test devices under **Unity Dashboard → Monetization → Settings →
Test device**. (`UNITY_ADS.testMode = true` in `src/data/ads.ts` forces test ads for everyone.)

## Personalised ads

The privacy flow matches Color Match & Merge. On first launch, before any ad loads, a "Before you
start" card explains the ads and links the privacy policy (https://politecarrot.com/privacy).
Continue leads straight into Apple's tracking prompt (App Tracking Transparency, worded by
`NSUserTrackingUsageDescription` in `Info.plist`). Allow counts as yes to personalised ads;
decline and ads are generic. Players can change it any time in **Settings → Privacy & Data**;
switching personalised ads on there asks Apple's question if it hasn't been answered, and if
tracking was declined it points them to the iPhone's Settings → Privacy & Security → Tracking.

Unity is told the ads may be personalised only when the player said yes *and* Apple's tracking is
allowed. That goes in as consent (`gdpr.consent` and `privacy.consent` metadata), so it covers GDPR
(EU/UK) and US privacy laws as well.

How it fits together:

- `@politecarrot/capacitor-unity-ads` (shared with Color Match & Merge) is the native bridge. It
  initialises the SDK, passes consent and asks Apple's tracking question.
- `src/ads/UnityAdsProvider.ts` is the game's side: it keeps both placements loaded (reloading
  after each ad, a failed load or a consent change). `Game.ts` uses it when running inside the
  app and keeps `MockAdProvider` on the web.
- `ios/App/App/MainViewController.swift` hides the status bar; the home indicator is hidden by
  Capacitor's SystemBars plugin (`plugins.SystemBars.hidden` in `capacitor.config.ts`).
- The game's own rules (`AdManager`) still decide when an interstitial may show.

## Before submitting to the App Store

- **Test ads**: make sure developer mode is off on the device you take store screenshots on.
- **SKAdNetwork IDs**: `Info.plist` has Unity's ID plus the main ID of every network in Unity's LevelPlay table (18 in all).
  Unity's extra partner list (the "View" link on the UnityAds row of that page) can be pasted into
  `SKAdNetworkItems` too.
- **Privacy**: in App Store Connect, declare that the app shows third-party ads and that Unity
  collects device and usage data for advertising (Unity documents the exact answers), and that the
  app uses data for tracking (it asks with Apple's tracking prompt). Privacy policy URL:
  https://politecarrot.com/privacy.
- **Remove Ads** is hidden from the shop for now (no in-app purchases yet), so there is nothing
  to set up in App Store Connect for purchases.
- **Version**: set the version and build number on the App target in Xcode (`MARKETING_VERSION`
  and `CURRENT_PROJECT_VERSION`).
- The app icon is already in `ios/App/App/Assets.xcassets/AppIcon.appiconset`, and the launch
  screen is plain black to match the Polite Carrot opening screen.
