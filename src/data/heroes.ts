// Hero and ally unit data.

export type HeroId = 'ranger' | 'knight' | 'mage' | 'dwarf' | 'valkyrie' | 'ninja';
export type AbilityKind = 'arrowRain' | 'taunt' | 'meteor' | 'quake' | 'holyLight' | 'shadowStrike';

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  description: string;
  color: string;
  hp: number;
  damage: number;
  range: number;
  cooldown: number;
  speed: number;
  damageType: 'physical' | 'magic';
  hitsAir: boolean;
  respawnTime: number;
  /** HP regenerated per second while not in contact. */
  regen: number;
  ability: {
    kind: AbilityKind;
    name: string;
    description: string;
    cooldown: number;
    damage: number;
    radius: number;
    /** Stun/taunt/slow duration. */
    duration: number;
    /** Shadow Strike: how many enemies it hits. Holy Light: castle HP restored. */
    count?: number;
    /** How far from the hero the ability can be aimed. */
    castRange: number;
  };
}

export const HEROES: Record<HeroId, HeroDef> = {
  ranger: {
    id: 'ranger', name: 'Robin', title: 'Royal Ranger', color: '#4f9d4a',
    description: 'Quick bow attacks that hit flyers.',
    hp: 180, damage: 13, range: 3.0, cooldown: 0.55, speed: 2.6, damageType: 'physical', hitsAir: true, respawnTime: 10, regen: 6,
    ability: { kind: 'arrowRain', name: 'Arrow Storm', description: 'Rains arrows on a wide area.', cooldown: 16, damage: 75, radius: 1.8, duration: 0, castRange: 4 },
  },
  knight: {
    id: 'knight', name: 'Sir Bramble', title: 'Castle Knight', color: '#5a7fd1',
    description: 'Tough melee hero. Taunt stuns all nearby foes.',
    hp: 480, damage: 28, range: 1.1, cooldown: 0.8, speed: 2.1, damageType: 'physical', hitsAir: false, respawnTime: 12, regen: 10,
    ability: { kind: 'taunt', name: 'Taunt', description: 'Stops every nearby enemy for 3s.', cooldown: 14, damage: 30, radius: 2.2, duration: 3, castRange: 0 },
  },
  mage: {
    id: 'mage', name: 'Elowen', title: 'Court Mage', color: '#a15bd1',
    description: 'Magic bolts. Meteor obliterates clusters.',
    hp: 150, damage: 24, range: 2.8, cooldown: 0.9, speed: 2.3, damageType: 'magic', hitsAir: true, respawnTime: 12, regen: 5,
    ability: { kind: 'meteor', name: 'Meteor', description: 'Huge fire blast on the densest crowd.', cooldown: 20, damage: 260, radius: 1.6, duration: 0, castRange: 5 },
  },
  dwarf: {
    id: 'dwarf', name: 'Brokk', title: 'Dwarf Engineer', color: '#c9783f',
    description: 'Stubborn and sturdy. His hammer cracks the earth.',
    hp: 560, damage: 36, range: 1.2, cooldown: 1.0, speed: 1.9, damageType: 'physical', hitsAir: false, respawnTime: 12, regen: 12,
    ability: { kind: 'quake', name: 'Earthquake', description: 'Slams the ground: damages and slows every nearby enemy by 60% for 4s.', cooldown: 15, damage: 110, radius: 2.5, duration: 4, castRange: 0 },
  },
  valkyrie: {
    id: 'valkyrie', name: 'Seraphine', title: 'Sky Valkyrie', color: '#f2c94c',
    description: 'Winged guardian. Holy javelins strike flyers.',
    hp: 300, damage: 26, range: 2.6, cooldown: 0.75, speed: 3.0, damageType: 'magic', hitsAir: true, respawnTime: 11, regen: 8,
    ability: { kind: 'holyLight', name: 'Holy Light', description: 'Smites nearby foes, fully heals Seraphine and restores 3 castle HP.', cooldown: 24, damage: 150, radius: 2.0, duration: 0, castRange: 0, count: 3 },
  },
  ninja: {
    id: 'ninja', name: 'Kage', title: 'Shadow Blade', color: '#5b4a8a',
    description: 'Lightning-fast blades. Vanishes and strikes again.',
    hp: 230, damage: 22, range: 1.3, cooldown: 0.4, speed: 3.6, damageType: 'physical', hitsAir: false, respawnTime: 9, regen: 7,
    ability: { kind: 'shadowStrike', name: 'Shadow Strike', description: 'Dashes through the 6 toughest enemies nearby, striking each.', cooldown: 13, damage: 170, radius: 0.6, duration: 0, castRange: 4.2, count: 6 },
  },
};

export const HERO_ORDER: HeroId[] = ['ranger', 'knight', 'mage', 'dwarf', 'valkyrie', 'ninja'];

/** Elite unit summoned by the Reinforcements rewarded ad. */
export const REINFORCEMENT = {
  name: 'Royal Champion',
  damage: 60,
  range: 2.4,
  cooldown: 0.45,
  splash: 0.8,
  hitsAir: true,
};
