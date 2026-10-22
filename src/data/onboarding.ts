// Onboarding hint texts. Logic lives in game/Tutorial.ts.

// Kept to a few words each: the siege moves fast, and a tip has to be read at a glance.
export const HINTS = {
  build_spot: 'Tap a glowing pad to build.',
  build_card: 'Tap the <b>Archer</b> twice to build.',
  start_wave: 'Tap <b>Start</b> when you\'re ready!',
  path: 'Stop the goblins reaching your castle!',
  more_towers: 'Build another tower here.',
  upgrade_tap: 'Tap a tower to upgrade it.',
  upgrade_btn: 'Upgrade for more damage and range.',
  early_call: 'Tap <b>Next</b> early for bonus gold.',
  hero_tap: 'Tap your <b>hero</b> to move them.',
  hero_place: 'Tap your <b>hero</b>, then any empty pad.',
  hero_move: 'Now tap an empty pad.',
  hero_ability: 'Use your hero\'s <b>ability</b> on crowds!',
  new_cannon: 'New: <b>Cannon</b>. Big splash, no flyers.',
  new_frost: 'New: <b>Frost</b>. Slows enemies down.',
  specialise: 'Max tier! Pick a <b>specialisation</b>.',
  speed: 'Tap <b>1x</b> to speed up.',
  clear_land: 'Tap <b>overgrown land</b> for a new pad.',
  materials: 'Upgrades go <b>Wood → Stone → Iron</b> and beyond.',
  checkpoint: 'Every 10 waves is a <b>checkpoint</b>.',
  camera: 'Drag to look around. Pinch to zoom.',
} as const;

/** Short lines for a new enemy's first appearance (the bestiary has the full story). */
export const ENEMY_TIPS: Partial<Record<string, string>> = {
  runner: 'Fast but fragile.',
  knight: 'Armoured: use magic.',
  bat: 'Flies: needs anti-air.',
  shaman: 'Heals other enemies.',
  shield: 'Shields the enemies behind it.',
  thief: 'Steals your gold.',
  tunneler: 'Digs under your towers.',
  siege: 'Stuns your towers.',
  scarab: 'Armoured swarms.',
  wraith: 'Hides underground.',
  wolf: 'Fast packs.',
  golem: 'Freezes nearby towers.',
  fireimp: 'Flies and resists magic.',
  magmaslug: 'Splits in two when killed.',
};

export type HintId = keyof typeof HINTS;
