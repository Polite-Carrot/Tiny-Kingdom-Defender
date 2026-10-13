# Tiny Kingdom Defender

A 3D tower defence game for the web, built with **Three.js + TypeScript + Vite**. It's designed to be wrapped for iOS/Android with Capacitor.

There are no external assets. Every model is low-poly geometry built in code, and every sound effect and music track is synthesised with the Web Audio API. The game runs fully offline as a single-player game, and saves progress to `localStorage`.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # typecheck + static build in dist/
npm run preview    # serve the production build
npm test           # unit tests (save migrations, ad rules, economy, levels, sim)
npm run sim        # headless balance simulator (see "Balancing")
```

## What's in the game

| Area | Contents |
|---|---|
| Campaign | 4 chapters × 15 levels (Meadow, Desert, Snow, Volcano). Each chapter has its own palette, props and music. Later chapters have multiple roads that merge or fork. There's a boss every 5th level. |
| Towers | Archer, Cannon, Frost, Lightning. Each has 3 tiers, then a choice of 2 specialisations (e.g. Longbow / Volley). You can sell towers for a 70% refund, set targeting to first / strongest / closest, and see the range when placing or selecting a tower. |
| Enemies | Grunt, Runner, Knight (resists physical damage), Bat (flies), Shaman (heals others), Shield-bearer (shields allies behind it), Imp (summoned). |
| Bosses | Ogre Warchief (summons imps), Sand Colossus (becomes immune for a while, summons), Frost Yeti (charges), Magma Drake (does all three). |
| Heroes | Robin the ranger (Arrow Storm), Sir Bramble the knight (Taunt, which stuns), Elowen the mage (Meteor). Tap a hero to select it, then tap the map to move it. |
| Modes | Campaign, Endless Siege (unlocks after level 5), and a Weekly Challenge with a modifier picked from the date. |
| Meta | Coins, permanent tower/castle/start-gold/hero upgrades (cost = `base × 1.35^level`), a Lightning unlock, hero unlocks, cosmetics (castle skins and projectile trails, bought with coins or shards). |
| Retention | Treasury (idle income, capped at 8 h), a free chest every 4 h, milestone chests, a 7-day login cycle, 3 daily missions, red-dot indicators. |
| Ads | `AdManager` plus a mock provider, 7 rewarded placements, interstitial rules, and a "Remove ads" flag. |
| Analytics | `Analytics` interface with a console/local implementation, plus a hidden debug screen. |

### Controls
* **Tap** a stone pad to build. Tap a card once to preview its range, then tap it again to build. Tap a tower to upgrade or sell it.
* **Tap your hero**, then tap the ground to move them. The purple button triggers the hero's ability.
* **Pinch or mouse wheel** zooms in. **Drag** pans while zoomed in.
* **Start / Next** sends the next wave. Calling it early gives bonus gold. **1x/2x** changes game speed.
* The game pauses automatically when the tab or app loses focus.

## Architecture

```
src/
  core/        Renderer, CameraRig (auto-framing), Input (tap/pinch/pan), Save (versioned), Emitter, Random
  data/        ALL balance/config: towers, enemies, levels, economy, heroes, ads, missions, onboarding
  game/        Run (pure simulation), LevelMap, WaveComposer, Levels, AutoPlayer (AI),
               Battle (controller), BattleView (3D), Tutorial, Meta (economy/progression), Game (orchestrator)
  entities/    ModelBuilder + Models: every mesh, built from merged primitives with vertex colours
  systems/     Audio (Web Audio synth + sequencer), Effects (instanced particles, rings, lightning)
  ui/          DOM overlay: UI (screens/modals/toasts/float text), Hud, Screens (title, world map), Modals, Thumbnails
  ads/         AdProvider interface, MockAdProvider, AdManager (+ pure interstitial rule evaluation)
  analytics/   Analytics interface, LocalAnalytics, summarise() for the debug screen
tools/sim.ts   headless balance simulator
tests/         vitest unit tests
```

**The core rule:** `game/Run.ts` is pure logic and imports no Three.js or DOM code. It owns enemies, towers, projectiles, the hero, waves and gold, and it emits typed events (`enemyDeath`, `towerFire`, `waveCleared`, and so on). Three things drive it:
* `Battle` steps it at a fixed 60 Hz (1x or 2x), sends input to it, and turns its events into analytics, mission progress and UI.
* `BattleView` reads its state every frame to draw it, and turns its events into effects: particles, screen shake, floating numbers, coin flights and sound.
* `tools/sim.ts` runs the same `Run` with no rendering, played by `AutoPlayer`.

So the balance simulator and the real game run exactly the same rules.

**Rendering budget.** All enemies of one type share a single `InstancedMesh` (11 meshes in total). Health bars, blob shadows and shield bubbles are instanced too, and so are projectiles (3 meshes) and particles (1 mesh). The static board, all props and all pads are merged into a few meshes. A typical frame is about 60–80 draw calls. Objects are pooled: enemies, projectiles, particles, rings, lightning bolts, floating-text DOM nodes and coin sprites.

**Responsive layout.** `CameraRig.frame()` binary-searches the camera distance until the whole diorama fits inside the screen area the HUD leaves free. It then uses `setViewOffset` to centre the board in that area. The HUD reserves the bottom strip in portrait, and the side columns in landscape. Rotating the device re-frames the board immediately. CSS switches between `body.portrait` and `body.landscape` layouts. Safe-area insets come from `env(safe-area-inset-*)`, and touch targets are at least 44 px.

## Where to tweak balance

Every gameplay number lives in `src/data/`. The gameplay code has no magic numbers.

| File | What it controls |
|---|---|
| `data/towers.ts` | Cost, per-tier stats, upgrade cost chain (each step ≈1.6×), specialisation stats, sell refund |
| `data/enemies.ts` | HP, speed, armour/magic resist, bounty, leak damage, wave-budget cost, `unlockLevel` and `minWave` gating, healer/shield/boss mechanics, boss HP per tier, `bountyHpExponent` |
| `data/levels.ts` | Map layouts, chapter themes, per-chapter wave budgets (`budgetBase/PerWave/PerLevel`), `hpMult`, `startGoldBonus`, `WAVE_COMPOSER` knobs (boss budget, path-length scaling, multi-road gold bonus), `LEVEL_OVERRIDES` for per-level tuning, onboarding unlock levels, weekly modifiers |
| `data/economy.ts` | Starting gold, wave-clear and early-call gold, star thresholds, the meta cost curve (`COST_GROWTH = 1.35`), upgrade definitions, level rewards (40–60 per win, 30% on loss, star bonus on first clear only), endless scaling and milestones, treasury, chests, daily login, ad rewards, cosmetics |
| `data/heroes.ts` | Hero stats and abilities, the Reinforcements champion |
| `data/ads.ts` | Rewarded placements, interstitial rules, mock ad duration |
| `data/missions.ts` | Mission pool |

**How waves are built.** Each wave has a point budget: `(budgetBase + budgetPerLevel·levelInChapter + budgetPerWave·wave) × pathLengthFactor`. That budget is spent on enemies whose `cost` and chapter weights decide the mix, in up to 3 groups spread across the roads. Enemy HP is `chapter.hpMult × (1 + 0.04·level) × (1 + 0.03·wave)`. Bounties scale with `hp^0.6`, so tougher enemies pay more, but gold per HP still falls. That falling gold-per-HP is what makes meta upgrades matter.

## Balancing tool

`npm run sim` plays every campaign level headlessly. `AutoPlayer` is a greedy AI: it builds on the pads that cover the most road, rotates through tower types, buys the cheapest upgrade, picks specialisations and uses the hero ability whenever it's ready. Each level is played over several seeds, with three meta profiles:

* **none**: no permanent upgrades.
* **typ**: a typical player who doesn't watch ads. It estimates the coins earned before each level (win rewards, stars, about 30 coins per level from missions, treasury and daily rewards) and spends them greedily on the cheapest upgrade. It unlocks Lightning when it can afford it.
* **high**: tower, castle, start-gold and hero upgrades all at level 8, with Lightning unlocked.

Options:
* `--seeds N`: seeds per cell.
* `--levels 16-30`: limit the range of levels.
* `--profiles none,typ`: limit the profiles.
* `--endless` / `--weekly`: simulate those modes instead.
* `--debug 55 [--profile typ] [--seed 0]`: print a wave-by-wave trace of one level, including leaks per enemy type.

The AI plays worse than a real player, so treat these numbers as a lower bound.

### Final balance report (6 seeds per cell; win % and average castle HP % remaining)

```
Level  Name                    Boss  Waves | none win  hp%  | typ  win  hp%  | high win  hp%  |
----------------------------------------------------------------------------------------------------
   1   Greenford Road                  8  |   100%  100%  |   100%  100%  |   100%  100%  |
   2   Willow Bend                     8  |   100%  100%  |   100%  100%  |   100%  100%  |
   3   Miller's Crossing               8  |   100%  100%  |   100%  100%  |   100%  100%  |
   4   Bramble Hollow                  8  |   100%  100%  |   100%  100%  |   100%  100%  |
   5   Ogre's Approach          B      9  |   100%   73%  |   100%   86%  |   100%  100%  |
   6   Sunny Fields                    9  |   100%  100%  |   100%  100%  |   100%  100%  |
   7   Old Oak Path                    9  |   100%   99%  |   100%  100%  |   100%  100%  |
   8   Foxglove Lane                   9  |   100%  100%  |   100%  100%  |   100%  100%  |
   9   Riverside                       9  |   100%  100%  |   100%  100%  |   100%  100%  |
  10   Shepherd's Rest          B      9  |   100%   64%  |   100%   91%  |   100%  100%  |
  11   Thistle Ridge                   9  |   100%   98%  |   100%  100%  |   100%  100%  |
  12   Copperwood                     10  |   100%  100%  |   100%  100%  |   100%  100%  |
  13   Daisy Downs                    10  |   100%  100%  |   100%  100%  |   100%  100%  |
  14   Hilltop Watch                  10  |   100%  100%  |   100%  100%  |   100%  100%  |
  15   Warchief's End           B     10  |   100%   44%  |   100%   54%  |   100%   77%  |
----------------------------------------------------------------------------------------------------
  16   Dusty Trail                     9  |   100%  100%  |   100%  100%  |   100%  100%  |
  17   Oasis Gate                      9  |   100%  100%  |   100%  100%  |   100%  100%  |
  18   Mirage Fork                     9  |   100%   68%  |   100%   85%  |   100%  100%  |
  19   Scorpion Pass                   9  |   100%   73%  |   100%   93%  |   100%  100%  |
  20   Colossus Rising          B     10  |   100%   51%  |   100%   98%  |   100%  100%  |
  21   Sandstone Steps                10  |   100%   74%  |   100%  100%  |   100%  100%  |
  22   Twin Dunes                     10  |   100%   94%  |   100%  100%  |   100%  100%  |
  23   Sunken Temple                  10  |   100%   98%  |   100%  100%  |   100%  100%  |
  24   Caravan Road                   10  |   100%   58%  |   100%   94%  |   100%  100%  |
  25   Shifting Sands           B     10  |    83%   18%  |   100%   92%  |   100%  100%  |
  26   Vulture Rock                   10  |   100%   91%  |   100%  100%  |   100%  100%  |
  27   Bone Canyon                    11  |     0%    0%  |   100%   51%  |   100%  100%  |
  28   Pharaoh's Way                  11  |    83%   13%  |   100%   51%  |   100%  100%  |
  29   Dune Sea                       11  |   100%   18%  |   100%   99%  |   100%  100%  |
  30   Heart of the Storm       B     11  |    67%   11%  |   100%   55%  |   100%   74%  |
----------------------------------------------------------------------------------------------------
  31   Icicle Gate                    10  |   100%  100%  |   100%  100%  |   100%  100%  |
  32   Frozen Lake                    10  |   100%   83%  |   100%  100%  |   100%  100%  |
  33   Pine Hollow                    10  |     0%    0%  |   100%   94%  |   100%  100%  |
  34   Avalanche Run                  10  |    67%   47%  |   100%   94%  |   100%  100%  |
  35   Yeti Tracks              B     11  |     0%    0%  |    83%   37%  |   100%   81%  |
  36   Glacier Steps                  11  |   100%   93%  |   100%  100%  |   100%  100%  |
  37   Snowdrift                      11  |   100%   75%  |   100%  100%  |   100%  100%  |
  38   Crystal Caves                  11  |   100%   75%  |   100%  100%  |   100%  100%  |
  39   Howling Ridge                  11  |     0%    0%  |   100%   46%  |   100%   94%  |
  40   Frostbite Pass           B     11  |     0%    0%  |    83%   78%  |   100%   98%  |
  41   Polar Keep                     11  |     0%    0%  |   100%   71%  |   100%   96%  |
  42   Blizzard Crossing              12  |    17%   17%  |   100%  100%  |   100%  100%  |
  43   Winter's Teeth                 12  |     0%    0%  |   100%   97%  |   100%  100%  |
  44   The Long Night                 12  |     0%    0%  |    67%   34%  |   100%   91%  |
  45   Yeti King                B     12  |     0%    0%  |   100%   45%  |   100%   95%  |
----------------------------------------------------------------------------------------------------
  46   Ashen Road                     10  |   100%   75%  |   100%  100%  |   100%  100%  |
  47   Ember Fields                   10  |   100%   63%  |   100%   99%  |   100%  100%  |
  48   Obsidian Fork                  10  |    83%   42%  |   100%   99%  |   100%   99%  |
  49   Magma Falls                    10  |     0%    0%  |   100%   76%  |   100%   88%  |
  50   Drake's Nest             B     11  |     0%    0%  |   100%   73%  |   100%   97%  |
  51   Cinder Steps                   11  |    83%   37%  |   100%  100%  |   100%  100%  |
  52   Smoke Hollow                   11  |    17%    6%  |   100%   92%  |   100%  100%  |
  53   Brimstone Gate                 11  |     0%    0%  |   100%   89%  |   100%  100%  |
  54   Lava Lake                      11  |     0%    0%  |    83%   39%  |   100%   82%  |
  55   Scorched Spire           B     11  |     0%    0%  |    50%    6%  |   100%   44%  |
  56   Molten Maze                    11  |     0%    0%  |   100%   80%  |   100%   94%  |
  57   Fire Gardens                   12  |    67%    8%  |   100%   99%  |   100%  100%  |
  58   Caldera Rim                    12  |     0%    0%  |   100%   67%  |   100%   82%  |
  59   Crown of Flame                 12  |     0%    0%  |   100%   99%  |   100%  100%  |
  60   The Magma Drake          B     12  |     0%    0%  |    67%   15%  |   100%   69%  |
----------------------------------------------------------------------------------------------------

Overall win rate: none 64% · typ 97% · high 100%

Endless Siege, waves reached (4 seeds): none 7–40 · typ 43–54 · high 46–68
Weekly challenge (Ice & Iron): none 0/4 · typ 4/4 · high 4/4
```

How this lines up with the design goals:
* **Early levels are easy wins.** Levels 1–14 are 100% for every profile.
* **Each chapter ramps steadily.** HP remaining falls across each chapter. Each new chapter opens slightly easier, as a breather, before ramping again.
* **Bosses are a clear spike.** Boss levels (5, 10, 15, …) always show a drop in HP remaining, and levels 35, 55 and 60 are the walls of the late game.
* **No-upgrade players start to struggle mid-chapter 2.** From level 18 they start losing stars (castle HP mostly 50–75%). The first losses come at the level 25 boss. From level 27 on, they either lose or barely survive (castle HP at or below 20%). This is the point where the shop and the rewarded ads (revive, reinforcements, +50% start gold) start to matter.

With typical upgrades and no early wave calls, a level lasts 3–4.5 minutes (level 1 is a shorter 2.5-minute tutorial).

The full output is saved in `docs/balance-report.txt`.

## Ads

`src/ads/AdProvider.ts` defines the SDK-facing interface (`init`, `isRewardedReady`, `showRewarded(placement) → 'completed' | 'skipped' | 'failed'`, `isInterstitialReady`, `showInterstitial`).

`AdManager` wraps the provider and handles the parts that don't depend on the SDK:
* **Rewards.** `showRewarded()` resolves `true` **only** when the result is `completed`. Otherwise it shows "Ad not available, try again later", or a "skipped" toast.
* **Pause and mute.** It pauses the battle and mutes audio while an ad is showing, then restores both.
* **Analytics.** It logs `ad_offer_shown`, `ad_offer_clicked`, `ad_result` and `interstitial_shown`.
* **Interstitial rules.** It applies them through the pure function `evaluateInterstitial()`, which is covered by unit tests. The rules live in `data/ads.ts`:
  * only after a **win**, every 3rd win;
  * never before 5 levels are cleared, and never in the first 3 minutes of a session;
  * skipped if a rewarded ad was watched in the last 3 minutes;
  * never after a revive offer or a loss;
  * the `removeAds` flag (placeholder purchase in Shop → Free) turns interstitials off. Rewarded ads stay available.

**Rewarded placements:**

| Placement | Reward |
|---|---|
| `level_end_double` | Double the coins earned |
| `revive` | Restore 50% castle HP and clear the gate. Once per level |
| `reinforcements` | A Royal Champion fights for 30 s. Once per level |
| `treasury_double` | Double the idle coins |
| `chest_skip` | Open the free chest now |
| `prelevel_gold` | +50% starting gold |
| `shop_bundle` | +60 coins, 3 times per day |

The mock provider shows a fullscreen overlay with a 5 s countdown and a close button. Closing a rewarded ad early counts as `skipped`. To test failures, go to **Settings → Developer → Mock ad result**, which can force Complete, Skip, Fail or Random. The same section has an "Ads unavailable" toggle.

### Plugging in a real SDK (AdMob shown; Unity Ads works the same way)
1. `npm i @capacitor-community/admob` (after setting up Capacitor, see below).
2. Implement the interface:
   ```ts
   import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
   import type { AdProvider, RewardedResult } from './AdProvider';

   export class AdMobProvider implements AdProvider {
     private rewardedLoaded = false;
     private interstitialLoaded = false;
     async init() {
       await AdMob.initialize({});
       void this.preload();
     }
     private async preload() {
       try { await AdMob.prepareRewardVideoAd({ adId: 'ca-app-pub-xxx/rewarded' }); this.rewardedLoaded = true; } catch { this.rewardedLoaded = false; }
       try { await AdMob.prepareInterstitial({ adId: 'ca-app-pub-xxx/interstitial' }); this.interstitialLoaded = true; } catch { this.interstitialLoaded = false; }
     }
     isRewardedReady() { return this.rewardedLoaded; }
     isInterstitialReady() { return this.interstitialLoaded; }
     async showRewarded(): Promise<RewardedResult> {
       let rewarded = false;
       const h = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true));
       try { await AdMob.showRewardVideoAd(); return rewarded ? 'completed' : 'skipped'; }
       catch { return 'failed'; }
       finally { h.remove(); this.rewardedLoaded = false; void this.preload(); }
     }
     async showInterstitial() {
       try { await AdMob.showInterstitial(); } finally { this.interstitialLoaded = false; void this.preload(); }
     }
   }
   ```
3. In `src/game/Game.ts`, replace `new MockAdProvider(...)` with `new AdMobProvider()`. Nothing else needs to change.

## Analytics

`src/analytics/Analytics.ts` defines `Analytics.track(name, params)`. `LocalAnalytics` logs structured events to the console (in dev builds), keeps the session's events in memory, and keeps a rolling buffer of the last 200 in `localStorage`.

To use a real backend (Firebase, GameAnalytics, Amplitude and so on), implement the same interface and swap it in at `Game.ts`.

Events logged: `session_start`, `level_start`, `level_end` (result, stars, wave reached, duration, castle HP), `wave_complete`, `tower_built`, `tower_upgraded`, `hero_ability_used`, `ad_offer_shown`, `ad_offer_clicked`, `ad_result`, `interstitial_shown`, `coins_earned` (with source), `coins_spent` (with sink), `upgrade_purchased`, `mission_complete`, `daily_reward_claimed`.

**Hidden debug screen.** Tap the version label on the title screen 5 times, press `~`, or open **Settings → Analytics debug**. It shows:
* ad views per placement (offered / clicked / completed / skipped / failed);
* coins by source and by sink;
* win rate by level;
* recent raw events.

It also has testing cheats: +1000 coins, unlock all levels, fill the treasury, make a chest ready, advance a day, and "autoplay battle" (the simulator AI plays the current battle).

## Save system

`src/core/Save.ts` handles saving and loading.
* **Versioning.** Saves are versioned (`SAVE_VERSION = 3`). `MIGRATIONS[n]` upgrades a version-n save to version n+1. To change the format, add a migration and bump the version.
* **Missing fields.** After migration, any missing field is filled in from `defaultSave()`.
* **Backups.** Each write keeps the previous good save under `tkd_save_backup`.
* **Corrupt saves.** If the main save is corrupt, it's copied to `tkd_save_corrupt` and the backup is loaded. If the backup is also unusable, the game resets, and a toast tells the player what happened.
* **When it writes.** It writes on every coin or progress change, on `pagehide` and `visibilitychange`, and every 10 s during play.

## Wrapping for iOS/Android with Capacitor

```bash
npm i @capacitor/core @capacitor/cli @capacitor/app
npx cap init "Tiny Kingdom Defender" com.example.tinykingdom --web-dir=dist
npm run build
npx cap add ios && npx cap add android
npx cap sync
npx cap open ios        # or: npx cap open android
```

Notes:
* **Asset paths.** `vite.config.ts` uses `base: './'`, so asset paths work from the `file://` / `capacitor://` origin.
* **Safe areas.** `index.html` sets `viewport-fit=cover`, and the CSS uses `env(safe-area-inset-*)`, so notches are already handled.
* **Pausing.** The game already pauses on `visibilitychange` and `blur`. For extra safety on native, you can also listen to `App.addListener('appStateChange', ...)` and call `tkd.openPause()`.
* **Orientation.** Both orientations are supported. Leave rotation unlocked in Xcode / AndroidManifest, or lock it if you prefer.
* **Storage.** `localStorage` persists inside the WebView. To get cloud backup, you can mirror the save JSON into `@capacitor/preferences`.

## Performance notes and the quality setting
* **Quality setting.** **High** uses a pixel ratio of up to 2, soft shadow maps from the sun, and 900 particles. **Low** uses a pixel ratio of 1, no shadow maps (enemies always use cheap blob shadows) and 400 particles. Change it in Settings.
* **Stable simulation.** The game uses a fixed 60 Hz simulation step with a capped number of catch-up steps, so a slow frame can't spiral.
* **No per-frame allocations in hot paths.** Matrices, colours and vectors are reused, and all pools grow only when needed.
* **UI updates.** The UI only re-renders panels when something meaningful changes (for example, whether you can afford an upgrade), so a tap can't be swallowed by a DOM swap.

## Trade-offs and notes
* **Flying enemies follow the road** at height instead of flying straight to the castle. This keeps placement readable and fair on small mobile screens. Only Archer, Frost, Lightning and some heroes can hit them.
* **Heroes don't block enemies.** They deal and take contact damage, and the Knight's Taunt provides the crowd control. This keeps tap-to-move simple and the simulation deterministic.
* **The UI is built in DOM/CSS** over the WebGL canvas, rather than in WebGL. Text stays crisp, accessibility is better, and it's easier to change. UI portraits of towers, enemies and heroes are rendered from the same procedural 3D models at boot (`ui/Thumbnails.ts`).
* **Balance comes from the AI**, which is greedy and worse than a human player. Late-game bosses (levels 35, 55, 60) are deliberately hard for an AI with typical upgrades. They're meant to reward good play, upgrades and the optional ads. `LEVEL_OVERRIDES` in `data/levels.ts` exists for hand-tuning individual levels.
* **Real purchases aren't implemented.** "Remove Ads" is a placeholder flag. Wire it to a real in-app purchase plugin (for example `@capacitor-community/in-app-purchases`) before shipping.
