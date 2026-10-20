# Tiny Kingdom: iOS app

The iOS app is a [Capacitor](https://capacitorjs.com) wrapper around the same single-file game
build that GitHub Pages serves. It lives in `ios/`, with real **Unity Ads** in place of the mock
ads the website uses.

| | |
|---|---|
| App name (home screen) | Tiny Kingdom |
| Bundle ID | `com.politecarrot.tinykingdomdefender` |
| Unity Game ID | `800404139` |
| Rewarded placement | `BP_Rewarded_iOS` (shared by every "▶ AD" button) |
| Interstitial placement | `BP_Interstitial_iOS` (checkpoints only) |
| Minimum iOS | 15.0, iPhone and iPad |

The ad IDs and the test-mode switch are in `src/data/ads.ts` (`UNITY_ADS`).

## Building on a Mac

You need a Mac with **Xcode**, **Node.js** and **CocoaPods** (`sudo gem install cocoapods` or
`brew install cocoapods`).

```sh
npm install
npm run ios:sync      # builds the game, copies it into the app and installs the pods (Unity Ads, Preferences)
npm run ios:open      # opens ios/App/App.xcworkspace in Xcode
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

On first launch the app asks whether ads may be personalised ("Allow personalised ads" / "Show
non-personalised ads"), before any ad loads; players can change it any time in Settings. The
answer is passed to Unity as consent (`gdpr.consent` and `privacy.consent` metadata), so it
covers GDPR (EU/UK) and US privacy laws. The app doesn't use Apple's tracking prompt (ATT), so on
iOS Unity doesn't get the advertising ID either way.

How it fits together:

- `ios/App/App/UnityAdsPlugin.swift` is the native bridge. It initialises the SDK, keeps both
  placements loaded (and reloads after each ad or a failed load), and shows them.
- `ios/App/App/MainViewController.swift` registers the plugin and hides the status bar.
- `src/ads/UnityAdsProvider.ts` is the game's side; `Game.ts` uses it when running inside the
  app and keeps `MockAdProvider` on the web.
- The game's own rules (`AdManager`) still decide when an interstitial may show.

## Before submitting to the App Store

- **Test ads**: make sure developer mode is off on the device you take store screenshots on.
- **SKAdNetwork IDs**: `Info.plist` has Unity's own ID. Unity publishes a longer list of partner
  network IDs for better ad revenue; paste it into `SKAdNetworkItems`.
- **Privacy**: in App Store Connect, declare that the app shows third-party ads and that Unity
  collects device and usage data for advertising (Unity documents the exact answers). The app does
  not ask for tracking permission (ATT), so ads are not personalised with the IDFA.
- **Remove Ads** is hidden from the shop for now (no in-app purchases yet), so there is nothing
  to set up in App Store Connect for purchases.
- **Version**: set the version and build number on the App target in Xcode (`MARKETING_VERSION`
  and `CURRENT_PROJECT_VERSION`).
- The app icon is already in `ios/App/App/Assets.xcassets/AppIcon.appiconset`, and the launch
  screen is plain black to match the Polite Carrot opening screen.
