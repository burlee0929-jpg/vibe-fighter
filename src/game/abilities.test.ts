import { describe, expect, it } from 'vitest';

import { getHeroAbilityKit, HERO_ABILITY_KITS, isAbilitySlotImmune } from './abilities';

const EXPECTED_HERO_IDS = [
  'vessel-yuji',
  'restless-gambler',
  'hero-hunter',
  'sukuna',
  'gojo',
  'naruto',
  'cyber-ronin',
  'goku',
  'frost-queen',
  'red-brawler',
  'green-boxer',
  'jiujitsu-fighter',
  'bayasaa'
];

describe('HERO_ABILITY_KITS', () => {
  it('defines unique 4-ability kits for every playable hero', () => {
    for (const id of EXPECTED_HERO_IDS) {
      const kit = HERO_ABILITY_KITS[id];
      expect(kit).toBeDefined();
      expect(kit.characterId).toBe(id);
      expect(kit.ability1.name.length).toBeGreaterThan(0);
      expect(kit.ability1.cooldown).toBeGreaterThan(0);
      expect(kit.ability2.name.length).toBeGreaterThan(0);
      expect(kit.ability2.cooldown).toBeGreaterThan(0);
      expect(kit.ability3.name.length).toBeGreaterThan(0);
      expect(kit.ability3.cooldown).toBeGreaterThan(0);
      expect(kit.ability3.projectile.damage).toBeGreaterThan(0);
      expect(kit.ability3.projectile.speed).toBeGreaterThan(0);
      expect(kit.ability4.name.length).toBeGreaterThan(0);
      expect(kit.m1.moves).toHaveLength(4);
      expect(kit.m1.lunge).toHaveLength(4);
      expect(kit.m1.stepDamageBonus).toHaveLength(3);
      for (const bonus of kit.m1.stepDamageBonus) {
        expect(bonus).toBeGreaterThanOrEqual(4);
      }
      expect(kit.m1.airMove.length).toBeGreaterThan(0);
      expect(kit.m1.finisherDamageBonus).toBeGreaterThanOrEqual(10);
    }
  });

  it('falls back safely when requesting an unknown hero id', () => {
    const kit = getHeroAbilityKit('unknown-challenger');
    expect(kit.characterId).toBe('unknown-challenger');
    expect(kit.ability1.name.length).toBeGreaterThan(0);
    expect(kit.ability3.projectile.name.length).toBeGreaterThan(0);
    expect(kit.m1.moves).toHaveLength(4);
  });

  it('keeps Bayasaa in boss-tier OP tuning', () => {
    const bayasaa = getHeroAbilityKit('bayasaa');
    const sukuna = getHeroAbilityKit('sukuna');
    expect(bayasaa.m1.finisherDamageBonus).toBeGreaterThan(sukuna.m1.finisherDamageBonus);
    expect(bayasaa.ability3.projectile.damage).toBeGreaterThan(sukuna.ability3.projectile.damage);
    expect(bayasaa.ability1.cooldown).toBeLessThan(sukuna.ability1.cooldown);
  });

  it('grants immunity during primary ability (slot 1) and Super Art (slot 4)', () => {
    expect(isAbilitySlotImmune(0)).toBe(false);
    expect(isAbilitySlotImmune(1)).toBe(true);
    expect(isAbilitySlotImmune(2)).toBe(false);
    expect(isAbilitySlotImmune(3)).toBe(false);
    expect(isAbilitySlotImmune(4)).toBe(true);
  });
});
