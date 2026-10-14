# Tiny Kingdom Defender

A 3D tower defence game for the web, built with **Three.js + TypeScript + Vite**. It's designed to be wrapped for iOS/Android with Capacitor.

You don't play separate levels. You build **one persistent kingdom** that is besieged by waves that never end. Your towers, gold and cleared land stay with you forever. Every 10 waves is a checkpoint. If the castle falls, you regroup at the last checkpoint with everything you've built, upgrade, and push further.

There are no external assets. Every model is low-poly geometry built in code, and every sound effect and music track is synthesised with the Web Audio API. The game runs fully offline as a single-player game, and saves progress to `localStorage`.

```bash
npm install
npm run dev        # play at http://localhost:5173
npm run build      # typecheck + static build in dist/
npm run preview    # serve the production build
npm test           # unit tests (save migrations, ad rules, economy, towers, siege)
npm run sim        # headless balance simulator (see "Balancing")
```

## What's in the game

| Area | Contents |
|---|---|
| The kingdom | One 15×15 map with the castle in the centre. You start with 6 build pads. 28 more are covered in overgrowth and can be **cleared with gold**, and each clearing costs more than the last. Roads that haven't opened yet show as overgrown trails, so you can plan ahead. |
| Endless siege | Waves never stop. A boss comes every 10 waves. **Checkpoints** are every 10 waves: if the castle falls you regroup there, keeping all towers and gold. The game saves at the start of every wave, and resuming replays that wave. |
| Roads | The West Road is open from wave 1. The North-East Road opens at wave 20 and the South Road at wave 40, each as a new Age begins. Before the first wave of a new Age or road, the siege pauses: the camera flies to the new tunnel, a beacon marks it, sparks march down the new road, and a card explains what changes (new Age, new road, newly unlocked tower). The wave starts when you tap **Ready!**. You only see this the first time; after a fall a short banner reminds you. |
| World | The board is a raised plateau with a moat, on an island of rolling hills and trees. Around it are sandy beaches and the sea (`systems/Water.ts`): Gerstner waves displaced on the GPU, with depth colour, sun glint, sky reflection, white caps, and surf that rolls in to shore. The Age of Frost adds drifting ice floes; the Age of Fire swaps the sea for flowing, crusting lava. Beyond the sea are distant mountains, a sky gradient, drifting clouds and floating pollen, dust, snow or embers (`systems/Scenery.ts`). The game opens on a menu where the camera slowly circles your kingdom. On High quality the scene is rendered in HDR with a soft bloom, so gems, lava, fire and magic glow, and thousands of instanced grass blades sway in the wind on the board and island (`systems/Grass.ts`). Roads are cobbled, the castle has crenellated walls, turrets, a gatehouse and banners, and enemies have faces, arms and gear. |
| Ages | Every 20 waves the land changes: Age of Meadows → Sands → Frost → Fire, then repeats harder (II, III…). Each Age has its own palette, props, sky, music and enemy mix. Every Age starts on a checkpoint, so once you reach a new Age a fall never sends you back to the previous one. |
| Towers | Eight towers: **Archer** (fast, hits flying), **Cannon** (splash), **Frost** (slows), **Mage** (arcane bolts that ignore armor, wave 8), **Ballista** (long range; bolts pierce a whole line, wave 12), **Lightning** (chains; Shop unlock), **Flame** (short range; sets enemies burning, unlocks with the Age of Sands at wave 20) and **Alchemist** (poison flasks that melt armor, unlocks with the Age of Frost at wave 40). Each has **10 material tiers**, and each upgrade rebuilds the tower in a new material: **Wood → Stone → Iron → Bronze → Silver → Gold → Jade → Crystal → Obsidian → Celestial**. Every tier adds ornaments: a roof, then a flag, banners, trim bands, a floating gem, spikes and finally a halo. Precious materials sparkle. Upgrading from tier 3 picks one of 2 specialisations (e.g. Longbow / Volley). After Celestial, towers keep growing with **star levels** (★1 … ★30) as an endless gold sink. You can sell towers for a 70% refund and set targeting to first / strongest / closest. |
| Enemies | Grunt, Runner, Knight (resists physical damage), Bat (flies), Shaman (heals others), Shield-bearer (shields allies behind it), Imp (summoned). |
| Bosses | Ogre Warchief (summons imps), Sand Colossus (becomes immune for a while, summons), Frost Yeti (charges), Magma Drake (does all three). |
| Heroes | Six heroes, unlocked with coins from the Heroes menu: Robin the ranger (Arrow Storm), Sir Bramble the knight (Taunt, which stuns), Elowen the mage (Meteor), **Brokk** the dwarf engineer (Earthquake: damages and slows everything nearby), **Seraphine** the sky valkyrie (Holy Light: smites foes, heals herself and restores 3 castle HP) and **Kage** the shadow blade (Shadow Strike: dashes through the 6 toughest enemies nearby). Each is a detailed chibi model with a face, armour, weapons and gear. They breathe, lean into a run and lunge to attack, and Seraphine hovers on flapping wings. Tap a hero to select it, then tap the map to move it. |
| Meta | Coins come from every wave cleared and every checkpoint. They buy permanent upgrades (tower damage and range, castle HP, War Chest +gold%, hero power; cost = `base × 1.35^level`), the Lightning unlock, heroes and cosmetics (castle skins and projectile trails, bought with coins or shards). You can open the Shop mid-siege from the HUD. |
| Retention | Treasury (idle income, capped at 8 h, grows with your best wave), a free chest every 4 h, a milestone chest at each new checkpoint, a 7-day login cycle, 3 daily missions, red-dot indicators. |
| Ads | `AdManager` plus a mock provider, 7 rewarded placements, interstitial rules, and a "Remove ads" flag. |
| Analytics | `Analytics` interface with a console/local implementation, plus a hidden debug screen. |

### Controls
* **Tap** a stone pad to build. Tap a card once to preview its range, then tap it again to build. Tap a tower to upgrade or sell it.
* **Tap overgrown land** (bushes and rocks on a pad) to clear it for gold.
* **Tap your hero**, then tap the ground to move them. The purple button triggers the hero's ability.
* **Pinch or mouse wheel** zooms in. **Drag** pans while zoomed in.
* **Start / Resume** begins the siege, and after that waves follow automatically. **Next** calls a wave early for bonus gold. **1x/2x** changes game speed.
* The game pauses automatically when the tab or app loses focus.

## Architecture

```
src/
  core/        Renderer, CameraRig (auto-framing), Input (tap/pinch/pan), Save (versioned), Emitter, Random
  data/        ALL balance/config: base (map, roads, land, siege scaling, unlocks), towers (tiers/materials),
               enemies, themes (Ages), economy, heroes, ads, missions, onboarding
  game/        Run (pure simulation + kingdom snapshot), Siege (waves, Ages, roads, checkpoints), LevelMap,
               WaveComposer, AutoPlayer (AI), Battle (controller + saving), BattleView (3D), Tutorial,
               Meta (coins/progression), Game (orchestrator)
  entities/    ModelBuilder + Models: every mesh, built from merged primitives with vertex colours
  systems/     Audio (Web Audio synth + sequencer), Effects (instanced particles, rings, lightning)
  ui/          DOM overlay: UI (screens/modals/toasts/float text), Hud, Screens (title, world map), Modals, Thumbnails
  ads/         AdProvider interface, MockAdProvider, AdManager (+ pure interstitial rule evaluation)
  analytics/   Analytics interface, LocalAnalytics, summarise() for the debug screen
tools/sim.ts   headless balance simulator
tests/         vitest unit tests
```

**The core rule:** `game/Run.ts` is pure logic and imports no Three.js or DOM code. It owns enemies, towers, projectiles, the hero, waves, gold and unlocked land. It emits typed events (`enemyDeath`, `waveCleared`, `checkpoint`, `ageChange`, `frontier`, `roadOpened`, `retreat`, and so on). It starts from a `BaseSnapshot`: the persisted kingdom, holding the wave, last checkpoint, gold, castle HP, towers, unlocked pads and the once-per-checkpoint ad flags. `snapshot()` produces the next one. Three things drive it:
* `Battle` steps it at a fixed 60 Hz (1x or 2x), sends input to it, and turns its events into analytics, mission progress and UI. It also saves the kingdom: at the start of every wave (snapshotted with that wave, so resuming replays it), and whenever the field is quiet after building or upgrading.
* `BattleView` reads its state every frame to draw it, and turns its events into effects: particles, screen shake, floating numbers, coin flights and sound.
* `tools/sim.ts` runs the same `Run` with no rendering, played by `AutoPlayer` for many hours of game time.

So the balance simulator and the real game run exactly the same rules.

**Rendering budget.** All enemies of one type share a single `InstancedMesh` (11 meshes in total). Waves are capped at 70 enemies (`maxEnemiesPerWave`): beyond that, counts shrink and each enemy gets proportionally more HP and gold, so very late waves stay phone-friendly. Tower models (40 material/branch/star variants per type) are built lazily and cached. Health bars, blob shadows and shield bubbles are instanced too, and so are projectiles (3 meshes) and particles (1 mesh). The static board, all props and all pads are merged into a few meshes. A typical frame is about 60–80 draw calls. Objects are pooled: enemies, projectiles, particles, rings, lightning bolts, floating-text DOM nodes and coin sprites.

**Responsive layout.** `CameraRig.frame()` binary-searches the camera distance until the whole diorama fits inside the screen area the HUD leaves free. It then uses `setViewOffset` to centre the board in that area. The HUD reserves the bottom strip in portrait, and the side columns in landscape. Rotating the device re-frames the board immediately. CSS switches between `body.portrait` and `body.landscape` layouts. Safe-area insets come from `env(safe-area-inset-*)`, and touch targets are at least 44 px.

## Where to tweak balance

Every gameplay number lives in `src/data/`. The gameplay code has no magic numbers.

| File | What it controls |
|---|---|
| `data/base.ts` | Roads and the waves they open on, land (`totalSpots`, `initialSpots`, clearing cost curve), `SIEGE` (start gold, castle HP, wave gap, checkpoint/age/boss intervals, wave budget curve, HP curve, bounty exponent, gold scaling, Gold Rush), `SIEGE_COINS` (coins per wave/checkpoint), `UNLOCK_WAVE` (when towers and features unlock), `ENEMY_FIRST_WAVE`, `WAVE_COMPOSER` (groups, boss budget, enemy cap) |
| `data/towers.ts` | Cost, tier-1 stats, per-tier growth, specialisation modifiers, `TIER_MATERIALS` (name and colours of each material), `UPGRADE_COST_GROWTH`, star levels (`MAX_LEVEL`, `STAR_DAMAGE`, `STAR_COST_GROWTH`), sell refund |
| `data/enemies.ts` | HP, speed, armour/magic resist, bounty, leak damage, wave-budget cost, healer/shield/boss mechanics |
| `data/themes.ts` | The four Ages: colours, props, music, enemy weights |
| `data/economy.ts` | Permanent upgrades and their cost curve (`COST_GROWTH = 1.35`), Lightning/hero unlock prices, treasury, chests, daily login, ad rewards, cosmetics |
| `data/heroes.ts` | Hero stats and abilities |
| `data/ads.ts` | Rewarded placements, interstitial rules, mock ad duration |
| `data/missions.ts` | Mission pool |

**How waves are built.** Wave *n* has a point budget of `(budgetBase + budgetPerWave · n^budgetExp) × (1 + roadBudgetBonus · (openRoads − 1))`, ×1.5 on boss waves. It's spent on enemies by the current Age's weights and each enemy's first wave, in groups spread across the open roads. Waves are deterministic per index, so a replayed wave is the same wave.
* **Enemy HP:** `(1 + 0.05n) × 1.022^n`.
* **Bounties:** scale with `hp^0.35`, and battle gold tapers from ×1 (wave 1) to ×0.45 (wave 30+).
* **Tier costs:** grow ×1.8 per tier while damage grows ×1.4.

So gold per HP keeps falling and tiers keep getting pricier. Every wall is beaten by replaying earlier waves for gold (after a fall), buying permanent upgrades with coins.

## Balancing tool

`npm run sim` plays the kingdom headlessly. `AutoPlayer` is a greedy AI: it builds on the pads that cover the most open road, clears land when it runs out of pads, buys the cheapest upgrade, picks specialisations and uses the hero ability on cooldown.

Modes:
* **Career (default).** One persistent kingdom over many hours of game time, played the way a player would. When the castle falls it regroups at the checkpoint with towers and gold kept. Coins from waves and checkpoints, plus about 60/hour from missions, daily rewards and treasury (no ads), go into permanent upgrades. It reports how long it takes to first reach each checkpoint and what the kingdom looks like then.
* `--push`: single attempts from a fresh kingdom with all permanent upgrades at a fixed level.
* `--waves`: the wave table (enemy mix, HP and gold multipliers).

Options: `--hours N`, `--seeds N`.

Two career profiles are compared: a typical player who spends coins, and one who never buys permanent upgrades. The AI is greedy and doesn't move the hero, so a real player will be faster. Treat the times as an upper bound. They're in game time at 1x; at 2x speed they're roughly halved in real time.

### Balance report

```
== Typical player (spends coins on upgrades, no ads) ==
Checkpoint   seed 1 time (falls)   seed 2 time (falls)   kingdom at checkpoint (seed 1)
  wave  10   4m (0)                4m (0)                6 towers, avg Stone (2.3), best Iron; meta Lv 0
  wave  20   13m (1)               13m (1)               9 towers, avg Bronze (3.8), best Bronze; meta Lv 1
  wave  30   18m (1)               24m (2)               10 towers, avg Bronze (4.4), best Silver; meta Lv 1
  wave  40   53m (6)               36m (3)               15 towers, avg Gold (5.9), best Gold; meta Lv 2
  wave  50   1.4h (26)             1.1h (20)             17 towers, avg Jade (6.7), best Jade; meta Lv 2
  wave  60   2.0h (32)             1.6h (26)             20 towers, avg Crystal (7.7), best Crystal; meta Lv 3
  wave  70   2.9h (42)             1.9h (30)             22 towers, avg Obsidian (8.7), best Obsidian; meta Lv 3
  wave  80   3.7h (51)             2.6h (37)             23 towers, avg Obsidian (9.4), best Celestial; meta Lv 4
  wave  90   5.4h (103)            3.2h (44)             25 towers, avg Celestial (10.6), best Celestial; meta Lv 4
  wave 100   5.9h (108)            4.3h (59)             25 towers, avg Celestial (11.0), best Celestial; meta Lv 4
  wave 110   13.6h (218)           8.1h (126)            30 towers, avg Celestial (14.3), best Celestial; meta Lv 7
  wave 120   17.8h (303)           13.7h (248)           31 towers, avg Celestial (15.4), best Celestial; meta Lv 7
  best wave after 20h: 125, 127 · castle falls: 338, 342
== Never buys permanent upgrades ==
Checkpoint   seed 1 time (falls)   seed 2 time (falls)   kingdom at checkpoint (seed 1)
  wave  10   4m (0)                4m (0)                6 towers, avg Stone (2.3), best Iron; meta Lv 0
  wave  20   13m (1)               13m (1)               9 towers, avg Bronze (3.8), best Bronze; meta Lv 0
  wave  30   24m (2)               24m (2)               12 towers, avg Silver (4.7), best Silver; meta Lv 0
  wave  40   52m (6)               34m (3)               15 towers, avg Gold (5.9), best Gold; meta Lv 0
  wave  50   1.5h (31)             1.3h (39)             18 towers, avg Jade (6.7), best Jade; meta Lv 0
  wave  60   2.4h (42)             1.8h (46)             21 towers, avg Crystal (8.0), best Crystal; meta Lv 0
  wave  70   3.6h (55)             2.3h (53)             23 towers, avg Obsidian (9.0), best Obsidian; meta Lv 0
  wave  80   5.6h (84)             4.0h (77)             25 towers, avg Celestial (10.3), best Celestial; meta Lv 0
  wave  90   8.9h (150)            6.2h (130)            27 towers, avg Celestial (11.7), best Celestial; meta Lv 0
  wave 100   10.2h (170)           9.3h (170)            27 towers, avg Celestial (12.5), best Celestial; meta Lv 0
  best wave after 20h: 106, 107 · castle falls: 393, 391

Single push from a fresh kingdom, no retreats (waves survived):
  all permanent upgrades at Lv  0: waves 18, 18, 17  (avg 7m)
  all permanent upgrades at Lv  5: waves 23, 31, 40  (avg 14m)
  all permanent upgrades at Lv 10: waves 51, 42, 54  (avg 24m)
  all permanent upgrades at Lv 15: waves 72, 68, 78  (avg 37m)
  all permanent upgrades at Lv 20: waves 79, 72, 78  (avg 39m)
```

The numbers above are game time at 1x speed for a greedy AI. In short:
* **The first ten minutes are smooth.** Wave 10 takes about 4 minutes, and there is about one castle fall before wave 20.
* **Each Age is a step up.** A new road opens with each of the first two new Ages (waves 20 and 40), so waves 40–50 are a real wall: about an hour to wave 50, with towers reaching Jade.
* **Then the siege gets serious.** Celestial towers arrive around wave 80–90, after 3–5 hours. Wave 100 takes about 4–6 hours, and wave 120 about 14–18 hours. It is still climbing after 20 hours (best wave about 125).
* **Permanent upgrades matter.** A player who never buys them is several hours behind by wave 100 and tops out around wave 106 after 20 hours. A single push from a fresh kingdom reaches wave 18 with no upgrades and about wave 75 with every upgrade at level 20.
* **Falls are part of the loop.** Late-game progress comes from replaying the last checkpoint segment for gold and coins. The fall counts are high because the AI keeps pushing into the wall; a person would also use the hero and smarter placement.

The full output is saved in `docs/balance-report.txt`.

## Ads

`src/ads/AdProvider.ts` defines the SDK-facing interface (`init`, `isRewardedReady`, `showRewarded(placement) → 'completed' | 'skipped' | 'failed'`, `isInterstitialReady`, `showInterstitial`).

`AdManager` wraps the provider and handles the parts that don't depend on the SDK:
* **Rewards.** `showRewarded()` resolves `true` **only** when the result is `completed`. Otherwise it shows "Ad not available, try again later", or a "skipped" toast.
* **Pause and mute.** It pauses the battle and mutes audio while an ad is showing, then restores both.
* **Analytics.** It logs `ad_offer_shown`, `ad_offer_clicked`, `ad_result` and `interstitial_shown`.
* **Interstitial rules.** It applies them through the pure function `evaluateInterstitial()`, which is covered by unit tests. The rules live in `data/ads.ts`:
  * only when a **checkpoint** is reached (the game's "win"), every 2nd checkpoint;
  * never before your best wave is 30, and never in the first 3 minutes of a session;
  * skipped if a rewarded ad was watched in the last 3 minutes;
  * never if the castle fell or a revive was offered since the previous checkpoint;
  * the `removeAds` flag (placeholder purchase in Shop → Free) turns interstitials off. Rewarded ads stay available.

**Rewarded placements:**

| Placement | Reward |
|---|---|
| `checkpoint_double` | Double the checkpoint coins |
| `revive` | Restore 50% castle HP and clear the gate. Once per checkpoint segment (10 waves) |
| `treasury_double` | Double the idle coins |
| `chest_skip` | Open the free chest now |
| `shop_bundle` | +60 coins, 3 times per day |

No ad is ever offered while a wave is being fought. Rewarded ads appear only at natural breaks: checkpoints, a fallen castle, the Treasury, the chest and the shop.

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

Events logged: `session_start`, `level_start` (entering the kingdom), `level_end` (a push ending at a `checkpoint` or a `retreat`, with wave reached, duration and castle HP), `wave_complete`, `tower_built`, `tower_upgraded`, `hero_ability_used`, `ad_offer_shown`, `ad_offer_clicked`, `ad_result`, `interstitial_shown`, `coins_earned` (with source), `coins_spent` (with sink), `upgrade_purchased`, `mission_complete`, `daily_reward_claimed`.

**Hidden debug screen.** Tap the version label on the title screen 5 times, press `~`, or open **Settings → Analytics debug**. It shows:
* ad views per placement (offered / clicked / completed / skipped / failed);
* coins by source and by sink;
* checkpoint rate per 10-wave segment (pushes vs. checkpoints reached);
* recent raw events.

It also has testing cheats: +1000 coins, +10 waves, +5000 gold, fill the treasury, make a chest ready, advance a day, and "autoplay battle" (the simulator AI plays the current battle).

## Save system

`src/core/Save.ts` handles saving and loading.
* **Versioning.** Saves are versioned (`SAVE_VERSION = 4`). `MIGRATIONS[n]` upgrades a version-n save to version n+1. To change the format, add a migration and bump the version. v3→v4 converts the old campaign saves: level records are dropped, players get 25 coins per level won, permanent upgrades are kept, and "start gold" becomes "War Chest".
* **The kingdom.** It's stored as `base` (a `BaseSnapshot`). Progress is in `progress` (best wave, best checkpoint, falls).
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
* **Offline behaviour.** The siege pauses while you're away and resumes from the start of the wave you were on, so quitting mid-wave can't be used to re-farm gold. The Treasury keeps earning idle coins. I chose this over towers defending on their own while you're away: that is hard to make fair and easy to exploit.
* **Falling isn't a reset.** Losing the castle only sends you back to the last checkpoint. Replaying those waves earns gold and coins, and that grind loop is what makes the siege "endless in theory". The difficulty curve outgrows any fixed set of towers, so permanent upgrades, star levels and land are what push the frontier further.
* **The campaign was removed** (60 levels, world map, stars, weekly challenge and the separate endless mode) in favour of the single kingdom.
* **Balance comes from the AI**, which is greedy and worse than a human player.
* **Real purchases aren't implemented.** "Remove Ads" is a placeholder flag. Wire it to a real in-app purchase plugin (for example `@capacitor-community/in-app-purchases`) before shipping.
