# Tiny Kingdom Defender: store listings

Everything to paste into App Store Connect and the Google Play Console. Character limits are
noted next to each field, and every text below fits within them.

Shared details

| Field | Value |
|---|---|
| Developer / seller name | Polite Carrot |
| Website (marketing URL) | https://politecarrot.com |
| Support URL | https://politecarrot.com/contact |
| Privacy policy URL | https://politecarrot.com/privacy |
| Contact email | hello@politecarrot.com |
| Copyright (Apple) | 2026 Polite Carrot |
| Price | Free |
| Contains ads | Yes (Unity Ads) |
| In-app purchases | None |

---

## Description (both stores)

Used as the App Store **Description** and the Google Play **Full description** (limit 4,000;
this is about 2,000).

```
Build towers. Raise heroes. Hold the walls for as long as you can.

Tiny Kingdom Defender is a cosy tower defence game with no end. Monsters march down the roads towards your castle, wave after wave, and every wave you survive makes your little kingdom stronger. How far can you get?

BUILD YOUR DEFENCES
• 12 towers to place and upgrade, from Archers and Cannons to Lightning, Flame and the Storm Shrine
• Gold Mines and Beacons to power up your economy and the towers around them
• Towers that work together: put the right ones side by side to unlock bonus synergies
• Walls and barricades to slow the horde on the road
• Master each tower to earn new titles and bonuses

LEAD YOUR HEROES
• 6 heroes, each with their own skills, from the archer Robin to the shadowy Kage
• Station a hero on the battlefield or keep them at the castle
• Level them up, choose their skills and kit them out with gear
• Field two heroes at once once you've earned the second slot

SURVIVE THE AGES
• Endless waves that grow tougher as you journey through four Ages: Meadows, Sands, Frost and Fire
• 21 kinds of enemy, including thieves, tunnellers, siege engines and elite champions
• A mighty boss at the end of every Age
• Day and night, rain, snow and storms that change how each wave plays
• Cast spells when things get desperate: Meteor, Deep Freeze, Gold Blessing and Mend Walls

TEN REALMS TO DEFEND
Start in Coil Keep and unlock new realms as you go further, each with its own roads and challenges, from the winding Serpent Pass to the four-road siege of Crownfall.

GROW YOUR KINGDOM
• Build a Farmstead, Blacksmith, Market, Chapel, Wizard Tower, Windmill and Barracks for lasting upgrades
• Your treasury fills up while you're away
• A new Daily Challenge every day with its own twist
• 69 achievements to collect, a bestiary to fill and stats to track
• Castle upgrades and cosmetics to make your kingdom your own

Free to play, with optional ads you can watch for rewards. Your progress is saved on your device.

Made by Polite Carrot.
```

---

## Apple App Store (App Store Connect)

| Field | Limit | Text |
|---|---|---|
| Name | 30 | `Tiny Kingdom Defender` |
| Subtitle | 30 | `Endless castle tower defence` |
| Primary category | | Games → Strategy |
| Secondary category | | Games → Casual |

**Promotional text** (170; can be changed any time without a new build):

```
Ten realms, six heroes and twelve towers. Hold back endless waves of monsters and see how long your tiny kingdom can survive!
```

**Keywords** (100, commas with no spaces; the name and subtitle already count, so they aren't
repeated):

```
td,towers,strategy,castle,siege,heroes,monsters,waves,offline,fantasy,knight,medieval,idle,battle
```

**What's New** (first version): `First release. Defend your kingdom!`

### Age rating

Answer the questionnaire like this. Expect **9+**.

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | Infrequent / mild |
| Realistic violence, blood, gore | None |
| Sexual content, nudity, profanity, crude humour | None |
| Alcohol, tobacco, drugs | None |
| Horror / fear themes | None |
| Gambling, simulated gambling, contests | None |
| Medical / treatment information | None |
| Unrestricted web access | No |
| User-generated content, messaging, chat | No |
| Made for Kids | No |

### App Privacy

Data collection: **Yes, we collect data**. All of it is collected by Unity Ads, not by the game.
Before submitting, compare with Unity's own guide to answering Apple's privacy questions
(search "Unity Ads Apple privacy" on docs.unity.com), in case Unity has changed what it collects.

| Data type | Used for | Linked to user | Used for tracking |
|---|---|---|---|
| Identifiers → Device ID | Third-party advertising, analytics | No | Yes |
| Usage Data → Advertising Data | Third-party advertising, analytics | No | Yes |
| Usage Data → Product Interaction | Third-party advertising, analytics | No | Yes |
| Location → Coarse Location | Third-party advertising | No | Yes |
| Diagnostics → Crash Data, Performance Data | Analytics | No | No |

The app asks Apple's tracking question (App Tracking Transparency), so "Used for tracking: Yes"
is correct and matches the privacy policy.

---

## Google Play (Play Console)

| Field | Limit | Text |
|---|---|---|
| App name | 30 | `Tiny Kingdom Defender` |
| Short description | 80 | `Build towers, raise heroes and defend your castle from endless monster waves!` |
| App category | | Game → Strategy |
| Tags (pick up to 5) | | Tower defense, Strategy, Casual, Fantasy, Offline |

**Release notes** (first version): `First release. Defend your kingdom!`

### App content

| Section | Answer |
|---|---|
| Privacy policy | https://politecarrot.com/privacy |
| Ads | Yes, the app contains ads |
| App access | All functionality is available without special access |
| Target audience | 13–15, 16–17 and 18+ (not under 13) |
| Appeals to children | No (the game is for a general audience; ticking under-13 brings in the Families rules, which Unity Ads doesn't meet by default) |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |

### Content rating (IARC questionnaire)

Category: **Game**. Expect **PEGI 7 / Everyone 10+**, or similar.

| Question | Answer |
|---|---|
| Violence | Yes: fantasy/cartoon violence against non-realistic creatures, no blood |
| Fear | No |
| Sexuality, language, drugs | No |
| Gambling | No (free reward chests open on a timer or by watching an ad; nothing is bought with real money) |
| Users can interact or exchange content | No |
| Shares the user's location | No |
| Digital purchases | No |

### Data safety

Does the app collect or share user data? **Yes** (through Unity Ads).
Is all data encrypted in transit? **Yes**.
Can users request deletion? **No**. The game has no accounts, and progress stays on the device;
uninstalling removes it.

| Data type | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Device or other IDs | Yes | Yes (Unity) | Advertising or marketing, analytics | No |
| App activity → App interactions | Yes | Yes (Unity) | Advertising or marketing, analytics | No |
| Location → Approximate location | Yes | Yes (Unity) | Advertising or marketing | No |
| App info and performance → Crash logs, Diagnostics | Yes | Yes (Unity) | Analytics | No |

As for Apple, compare with Unity's own Data safety guide on docs.unity.com before submitting.

### Closed testing

New personal developer accounts must run a closed test with at least 12 testers for 14 days
before the app can go to production. Set it up as soon as the first build is uploaded.

---

## Graphics

| Asset | Size | Notes |
|---|---|---|
| App icon (Google Play) | 512×512 PNG | From the app icon |
| Feature graphic (Google Play) | 1024×500 PNG/JPG | Banner shown at the top of the listing |
| iPhone screenshots | 1320×2868 (6.9") portrait | 3 to 10; Apple scales them for smaller iPhones |
| iPad screenshots | 2064×2752 (13") portrait | Needed while the app runs on iPad |
| Phone screenshots (Google Play) | 1080×1920 or larger, 9:16 | 2 to 8 |
