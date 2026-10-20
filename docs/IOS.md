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

## Ads: test mode first

`UNITY_ADS.testMode` is `true`, so the app shows Unity's test ads. Keep it on while testing:
tapping real ads on your own device can get the Unity account flagged. You can also register
your device under **Unity Dashboard → Monetization → Settings → Test device**.

Before the App Store build, set `testMode: false` in `src/data/ads.ts` and run
`npm run ios:sync` again.

How it fits together:

- `ios/App/App/UnityAdsPlugin.swift` is the native bridge. It initialises the SDK, keeps both
  placements loaded (and reloads after each ad or a failed load), and shows them.
- `ios/App/App/MainViewController.swift` registers the plugin and hides the status bar.
- `src/ads/UnityAdsProvider.ts` is the game's side; `Game.ts` uses it when running inside the
  app and keeps `MockAdProvider` on the web.
- The game's own rules (`AdManager`) still decide when an interstitial may show.

## Before submitting to the App Store

- **Turn test mode off** (see above).
- **SKAdNetwork IDs**: `Info.plist` has Unity's own ID. Unity publishes a longer list of partner
  network IDs for better ad revenue; paste it into `SKAdNetworkItems`.
- **Privacy**: in App Store Connect, declare that the app shows third-party ads and that Unity
  collects device and usage data for advertising (Unity documents the exact answers). The app does
  not ask for tracking permission (ATT), so ads are not personalised with the IDFA.
- **Remove Ads** in the shop is still a placeholder purchase. Wire it to a real in-app purchase,
  or hide it, before release.
- **Version**: set the version and build number on the App target in Xcode (`MARKETING_VERSION`
  and `CURRENT_PROJECT_VERSION`).
- The app icon is already in `ios/App/App/Assets.xcassets/AppIcon.appiconset`, and the launch
  screen is plain black to match the Polite Carrot opening screen.
