// Spells: cast from the bar during a wave, then recharge. They unlock as your best wave grows
// and get stronger (and recharge faster) with permanent upgrades bought in the Shop.

import type { IconName } from '../ui/icons';

export type SpellId = 'meteor' | 'freeze' | 'blessing' | 'repair';

export interface SpellDef {
  id: SpellId;
  name: string;
  description: string;
  icon: IconName;
  color: string;
  /** Best wave needed to use it. */
  unlockWave: number;
  /** Seconds to recharge at level 0. */
  cooldown: number;
  /** Shop upgrade cost: base × COST_GROWTH^level. */
  baseCost: number;
}

export const SPELLS: SpellDef[] = [
  { id: 'meteor', name: 'Meteor', description: 'A blazing meteor crashes into the thickest crowd of enemies.', icon: 'meteor', color: '#ff7a2a', unlockWave: 8, cooldown: 60, baseCost: 120 },
  { id: 'freeze', name: 'Deep Freeze', description: 'Every enemy on the field is frozen solid for a few seconds.', icon: 'freeze', color: '#9fdcf5', unlockWave: 14, cooldown: 80, baseCost: 150 },
  { id: 'blessing', name: 'Gold Blessing', description: 'Enemies drop double gold for a while.', icon: 'blessing', color: '#ffd84a', unlockWave: 22, cooldown: 100, baseCost: 180 },
  { id: 'repair', name: 'Mend Walls', description: 'Masons patch up the castle, restoring some HP.', icon: 'repair', color: '#7dffb0', unlockWave: 32, cooldown: 140, baseCost: 220 },
];

export const SPELL_BY_ID = Object.fromEntries(SPELLS.map((s) => [s.id, s])) as Record<SpellId, SpellDef>;

export const SPELL_RULES = {
  maxLevel: 10,
  /** Each level: this much less recharge time. */
  cooldownPerLevel: 0.04,
  /** Meteor: damage = base × (wave HP multiplier)^exp × (1 + perLevel × level). */
  meteorDamage: 140,
  meteorExp: 0.95,
  meteorRadius: 1.5,
  meteorPerLevel: 0.15,
  /** Deep Freeze: seconds (bosses are held for 40% of it). */
  freezeTime: 2.5,
  freezePerLevel: 0.25,
  /** Gold Blessing: seconds of double kill gold. */
  blessingTime: 15,
  blessingPerLevel: 1.5,
  /** Mend Walls: castle HP restored. */
  repairHp: 3,
  repairPerLevel: 0.5,
};

/** What a spell does at a level, for the Shop and the cast. */
export function spellPower(id: SpellId, level: number): { value: number; text: string } {
  const r = SPELL_RULES;
  if (id === 'meteor') return { value: 1 + r.meteorPerLevel * level, text: `${Math.round((1 + r.meteorPerLevel * level) * 100)}% meteor damage` };
  if (id === 'freeze') { const v = r.freezeTime + r.freezePerLevel * level; return { value: v, text: `Frozen for ${v.toFixed(1)}s` }; }
  if (id === 'blessing') { const v = r.blessingTime + r.blessingPerLevel * level; return { value: v, text: `Double gold for ${Math.round(v)}s` }; }
  const v = Math.floor(r.repairHp + r.repairPerLevel * level);
  return { value: v, text: `Restores ${v} castle HP` };
}

export function spellCooldown(id: SpellId, level: number): number {
  return SPELL_BY_ID[id].cooldown * (1 - SPELL_RULES.cooldownPerLevel * level);
}
