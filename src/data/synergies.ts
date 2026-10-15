// Tower synergies: two different towers built close together boost each other.

import type { TowerId } from './towers';

export type SynergyId = 'shatter' | 'fumes' | 'enchanted' | 'superconductor' | 'siege' | 'arcaneStorm' | 'rockslide' | 'firestorm';

export interface SynergyDef {
  id: SynergyId;
  name: string;
  towers: [TowerId, TowerId];
  description: string;
  color: string;
}

/** Towers within this many tiles of each other link up. */
export const SYNERGY_RANGE = 2.3;

export const SYNERGIES: SynergyDef[] = [
  { id: 'shatter', name: 'Shatter', towers: ['frost', 'cannon'], color: '#9fdcf5', description: 'Cannon deals +40% damage to slowed or frozen enemies.' },
  { id: 'fumes', name: 'Volatile Fumes', towers: ['flame', 'alchemist'], color: '#c8e04a', description: 'Burning and poison both last 50% longer and hit 30% harder.' },
  { id: 'enchanted', name: 'Enchanted Arrows', towers: ['archer', 'mage'], color: '#c8a6ff', description: 'Archer +30% damage; Mage +0.4 range.' },
  { id: 'superconductor', name: 'Superconductor', towers: ['lightning', 'frost'], color: '#bfeaff', description: 'Lightning chains to 2 more enemies; Frost slows 10% more.' },
  { id: 'siege', name: 'Siege Engineers', towers: ['ballista', 'cannon'], color: '#e8b070', description: 'Ballista pierces 2 more enemies; Cannon blast +0.3.' },
  { id: 'arcaneStorm', name: 'Arcane Storm', towers: ['mage', 'lightning'], color: '#b48cf0', description: 'Both deal +20% damage.' },
  { id: 'rockslide', name: 'Rockslide', towers: ['catapult', 'gale'], color: '#c9b48a', description: 'Catapult blast +0.35; Storm Shrine pushes 30% further.' },
  { id: 'firestorm', name: 'Firestorm', towers: ['gale', 'flame'], color: '#ffb36a', description: 'Flame +0.6 range; Storm Shrine gusts set enemies burning.' },
];

export const SYNERGY_BY_ID = Object.fromEntries(SYNERGIES.map((s) => [s.id, s])) as Record<SynergyId, SynergyDef>;
