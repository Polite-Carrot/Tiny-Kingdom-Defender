// Onboarding hint texts. Logic lives in game/Tutorial.ts.

export const HINTS = {
  build_spot: 'Tap a glowing stone pad to build a tower.',
  build_card: 'Pick the <b>Archer</b>, then tap it again to build.',
  start_wave: 'Ready? Tap <b>Start</b> to send the first wave! Your kingdom is saved as you play.',
  path: 'Goblins march along the road to your castle. Don\'t let them through!',
  more_towers: 'You have gold! Build another tower here.',
  upgrade_tap: 'Tap a tower to see its upgrades.',
  upgrade_btn: 'Upgrade for more damage and range!',
  early_call: 'Call the next wave <b>early</b> for bonus gold.',
  hero_tap: 'Meet your hero! <b>Tap</b> them to select…',
  hero_move: '…then tap anywhere on the map to move there.',
  hero_ability: 'Use your hero\'s <b>ability</b> when enemies bunch up!',
  new_cannon: 'New tower: <b>Cannon</b> — big splash damage, but it can\'t hit flyers.',
  new_frost: 'New tower: <b>Frost</b> — slows enemies so others can finish them.',
  specialise: 'Max tier! Choose a <b>specialisation</b> — each branch changes how the tower plays.',
  speed: 'Tip: tap <b>1x</b> to play at double speed.',
  clear_land: 'Out of pads? Tap <b>overgrown land</b> and clear it for a new build spot.',
  materials: 'Each upgrade rebuilds the tower in a stronger material: <b>Wood → Stone → Iron →</b> … all the way to <b>Celestial</b>!',
  checkpoint: 'Every 10 waves is a <b>checkpoint</b>. If the castle falls you regroup there — towers and gold are kept.',
} as const;

export type HintId = keyof typeof HINTS;
