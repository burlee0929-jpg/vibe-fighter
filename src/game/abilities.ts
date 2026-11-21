import type { VfxColor } from './vfx';

export type ProjectileShape = 'arrow' | 'orb' | 'shuriken' | 'crescent' | 'beam' | 'spear';

export type DomainStyle = 'shrine' | 'void' | 'kurama' | 'cyber' | 'cosmic' | 'blizzard' | 'vortex';

export type M1CombatStyle = 'slash' | 'brawl' | 'energy' | 'frost' | 'martial';

export interface HeroM1Spec {
  style: M1CombatStyle;
  color: number;
  moves: [string, string, string, string];
  airMove: string;
  lunge: [number, number, number, number];
  stepDamageBonus: [number, number, number];
  finisherDamageBonus: number;
  finisherKnockbackMul: number;
}

export interface AbilityProjectileSpec {
  name: string;
  shape: ProjectileShape;
  color: number;
  coreColor: number;
  speed: number;
  damage: number;
  knockback: number;
  hitstun: number;
  size: number;
}

export interface HeroAbilityKit {
  characterId: string;
  themeColor: number;
  vfxColor: number;
  cutInColor: VfxColor;
  domainStyle: DomainStyle;
  m1: HeroM1Spec;
  ability1: {
    name: string;
    notation: string;
    cooldown: number;
    lunge: number;
    callout: string;
  };
  ability2: {
    name: string;
    notation: string;
    cooldown: number;
    lunge: number;
    callout: string;
    chainCallout: string;
  };
  ability3: {
    name: string;
    notation: string;
    cooldown: number;
    callout: string;
    projectile: AbilityProjectileSpec;
  };
  ability4: {
    name: string;
    notation: string;
    callout: string;
  };
}

const DEFAULT_KIT: HeroAbilityKit = {
  characterId: 'red-brawler',
  themeColor: 0xef4444,
  vfxColor: 0xf97316,
  cutInColor: 'red',
  domainStyle: 'vortex',
  m1: {
    style: 'brawl',
    color: 0xf97316,
    moves: ['STREET JAB', 'HOOK PUNCH', 'SPINNING KICK', 'HAYMAKER SLAM!'],
    airMove: 'FLYING KNEE',
    lunge: [55, 95, 130, 210],
    stepDamageBonus: [4, 5, 5],
    finisherDamageBonus: 10,
    finisherKnockbackMul: 1.5
  },
  ability1: {
    name: 'BLAZE DASH',
    notation: '236S',
    cooldown: 1.7,
    lunge: 230,
    callout: 'BLAZE DASH!'
  },
  ability2: {
    name: 'UPPER SNAP',
    notation: '236P',
    cooldown: 2.1,
    lunge: 260,
    callout: 'FLAME UPPER!',
    chainCallout: 'BLAZE UPPER CHAIN!'
  },
  ability3: {
    name: 'FIREBALL',
    notation: '214P',
    cooldown: 2.6,
    callout: 'CRIMSON FIREBALL!',
    projectile: {
      name: 'Fireball',
      shape: 'orb',
      color: 0xf97316,
      coreColor: 0xfef08a,
      speed: 680,
      damage: 12,
      knockback: 260,
      hitstun: 400,
      size: 26
    }
  },
  ability4: {
    name: 'CYCLONE',
    notation: '236236K',
    callout: 'CYCLONE UPPERCUT!'
  }
};

export const HERO_ABILITY_KITS: Record<string, HeroAbilityKit> = {
  sukuna: {
    characterId: 'sukuna',
    themeColor: 0xef4444,
    vfxColor: 0xdc2626,
    cutInColor: 'red',
    domainStyle: 'shrine',
    m1: {
      style: 'slash',
      color: 0xef4444,
      moves: ['SHRINE JAB', 'CURSED KICK', 'DISMANTLE CUT', 'CLEAVE FINISHER!'],
      airMove: 'AERIAL SLASH',
      lunge: [60, 100, 145, 225],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.55
    },
    ability1: {
      name: 'CLEAVE',
      notation: '236S',
      cooldown: 1.6,
      lunge: 195,
      callout: 'CLEAVE!'
    },
    ability2: {
      name: 'FOLLOW-UP',
      notation: '236P',
      cooldown: 2.0,
      lunge: 260,
      callout: 'DISMANTLE SLASH!',
      chainCallout: 'DISMANTLE FOLLOW-UP!'
    },
    ability3: {
      name: 'FUGA ARROW',
      notation: '214P',
      cooldown: 2.8,
      callout: 'FUGA: FIRE ARROW!',
      projectile: {
        name: 'Fuga Arrow',
        shape: 'arrow',
        color: 0xf97316,
        coreColor: 0xfef3c7,
        speed: 780,
        damage: 14,
        knockback: 310,
        hitstun: 460,
        size: 32
      }
    },
    ability4: {
      name: 'SHRINE',
      notation: '236236K',
      callout: 'MALEVOLENT SHRINE!'
    }
  },

  gojo: {
    characterId: 'gojo',
    themeColor: 0x8b5cf6,
    vfxColor: 0xa855f7,
    cutInColor: 'blue',
    domainStyle: 'void',
    m1: {
      style: 'energy',
      color: 0xa855f7,
      moves: ['INFINITY PALM', 'LIMITLESS SNAP', 'BLUE PULSE', 'REVERSAL SMASH!'],
      airMove: 'VOID DIVE',
      lunge: [65, 105, 140, 220],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.55
    },
    ability1: {
      name: 'RED BLAST',
      notation: '236S',
      cooldown: 1.7,
      lunge: 215,
      callout: 'REVERSAL: RED!'
    },
    ability2: {
      name: 'LAPSE BLUE',
      notation: '236P',
      cooldown: 2.1,
      lunge: 270,
      callout: 'LAPSE: BLUE!',
      chainCallout: 'INFINITY CRUSH!'
    },
    ability3: {
      name: 'HOLLOW PURP',
      notation: '214P',
      cooldown: 3.0,
      callout: 'HOLLOW PURPLE!',
      projectile: {
        name: 'Hollow Purple',
        shape: 'orb',
        color: 0x9333ea,
        coreColor: 0xf5d0fe,
        speed: 700,
        damage: 15,
        knockback: 340,
        hitstun: 480,
        size: 34
      }
    },
    ability4: {
      name: 'INFINITE VOID',
      notation: '236236K',
      callout: 'DOMAIN: INFINITE VOID!'
    }
  },

  naruto: {
    characterId: 'naruto',
    themeColor: 0xf97316,
    vfxColor: 0xfbbf24,
    cutInColor: 'gold',
    domainStyle: 'kurama',
    m1: {
      style: 'martial',
      color: 0xfbbf24,
      moves: ['KUNAI STRIKE', 'CLONE KICK', 'CHAKRA UPPER', 'RASEN IMPACT!'],
      airMove: 'SHINOBI DROP',
      lunge: [65, 110, 150, 230],
      stepDamageBonus: [4, 5, 5],
      finisherDamageBonus: 10,
      finisherKnockbackMul: 1.5
    },
    ability1: {
      name: 'CLONE DASH',
      notation: '236S',
      cooldown: 1.5,
      lunge: 250,
      callout: 'SHADOW CLONE BLITZ!'
    },
    ability2: {
      name: 'RASENGAN',
      notation: '236P',
      cooldown: 2.0,
      lunge: 270,
      callout: 'RASENGAN!',
      chainCallout: 'ODAMA RASENGAN!'
    },
    ability3: {
      name: 'SHURIKEN',
      notation: '214P',
      cooldown: 2.8,
      callout: 'RASENSHURIKEN!',
      projectile: {
        name: 'Rasenshuriken',
        shape: 'shuriken',
        color: 0x38bdf8,
        coreColor: 0xfef9c3,
        speed: 740,
        damage: 14,
        knockback: 310,
        hitstun: 450,
        size: 30
      }
    },
    ability4: {
      name: 'KURAMA',
      notation: '236236K',
      callout: 'NINE-TAILS SAGE BARRAGE!'
    }
  },

  'cyber-ronin': {
    characterId: 'cyber-ronin',
    themeColor: 0x06b6d4,
    vfxColor: 0x22d3ee,
    cutInColor: 'blue',
    domainStyle: 'cyber',
    m1: {
      style: 'slash',
      color: 0x22d3ee,
      moves: ['NEON DRAW', 'IAIDO CUT', 'PLASMA SLASH', 'CYBER SEVER!'],
      airMove: 'VOLT CLEAVE',
      lunge: [70, 115, 160, 240],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.5
    },
    ability1: {
      name: 'VOLT IAIDO',
      notation: '236S',
      cooldown: 1.5,
      lunge: 270,
      callout: 'VOLT IAIDO!'
    },
    ability2: {
      name: 'PLASMA CUT',
      notation: '236P',
      cooldown: 1.9,
      lunge: 255,
      callout: 'PLASMA CRESCENT!',
      chainCallout: 'OVERDRIVE SLASH!'
    },
    ability3: {
      name: 'ARC WAVE',
      notation: '214P',
      cooldown: 2.5,
      callout: 'ARC BLADE WAVE!',
      projectile: {
        name: 'Arc Blade Wave',
        shape: 'crescent',
        color: 0x06b6d4,
        coreColor: 0xe0f2fe,
        speed: 830,
        damage: 13,
        knockback: 280,
        hitstun: 420,
        size: 30
      }
    },
    ability4: {
      name: 'BLADE STORM',
      notation: '236236K',
      callout: 'CYBER BLADE STORM!'
    }
  },

  goku: {
    characterId: 'goku',
    themeColor: 0x38bdf8,
    vfxColor: 0x60a5fa,
    cutInColor: 'blue',
    domainStyle: 'cosmic',
    m1: {
      style: 'energy',
      color: 0x60a5fa,
      moves: ['Z-VANISH JAB', 'METEOR KICK', 'KI WAVE PALM', 'DRAGON KNOCKOUT!'],
      airMove: 'METEOR DROP',
      lunge: [65, 110, 155, 235],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.6
    },
    ability1: {
      name: 'METEOR DASH',
      notation: '236S',
      cooldown: 1.6,
      lunge: 260,
      callout: 'METEOR SMASH!'
    },
    ability2: {
      name: 'DRAGON FIST',
      notation: '236P',
      cooldown: 2.0,
      lunge: 270,
      callout: 'DRAGON UPPER!',
      chainCallout: 'ULTRA DRAGON FINISH!'
    },
    ability3: {
      name: 'KAMEHAMEHA',
      notation: '214P',
      cooldown: 2.9,
      callout: 'KAMEHAMEHA!',
      projectile: {
        name: 'Kamehameha',
        shape: 'beam',
        color: 0x38bdf8,
        coreColor: 0xffffff,
        speed: 860,
        damage: 15,
        knockback: 350,
        hitstun: 470,
        size: 36
      }
    },
    ability4: {
      name: 'ULTRA RUSH',
      notation: '236236K',
      callout: 'AUTONOMOUS ULTRA RUSH!'
    }
  },

  'frost-queen': {
    characterId: 'frost-queen',
    themeColor: 0x7dd3fc,
    vfxColor: 0x38bdf8,
    cutInColor: 'blue',
    domainStyle: 'blizzard',
    m1: {
      style: 'frost',
      color: 0x7dd3fc,
      moves: ['FROST TOUCH', 'ICE LANCE KICK', 'CRYO SLASH', 'GLACIER SHATTER!'],
      airMove: 'CRYSTAL DIVE',
      lunge: [55, 95, 135, 215],
      stepDamageBonus: [4, 5, 5],
      finisherDamageBonus: 10,
      finisherKnockbackMul: 1.5
    },
    ability1: {
      name: 'GLACIER EDGE',
      notation: '236S',
      cooldown: 1.7,
      lunge: 220,
      callout: 'GLACIER PIERCE!'
    },
    ability2: {
      name: 'SHATTER NOVA',
      notation: '236P',
      cooldown: 2.1,
      lunge: 245,
      callout: 'SHATTER NOVA!',
      chainCallout: 'CRYSTAL SHATTER!'
    },
    ability3: {
      name: 'ICE SPEAR',
      notation: '214P',
      cooldown: 2.6,
      callout: 'CRYO ICE SPEAR!',
      projectile: {
        name: 'Ice Spear',
        shape: 'spear',
        color: 0x38bdf8,
        coreColor: 0xf0f9ff,
        speed: 790,
        damage: 13,
        knockback: 290,
        hitstun: 460,
        size: 32
      }
    },
    ability4: {
      name: 'ZERO DOMAIN',
      notation: '236236K',
      callout: 'ABSOLUTE ZERO!'
    }
  },

  'red-brawler': DEFAULT_KIT,

  'green-boxer': {
    characterId: 'green-boxer',
    themeColor: 0x22c55e,
    vfxColor: 0x4ade80,
    cutInColor: 'gold',
    domainStyle: 'vortex',
    m1: {
      style: 'brawl',
      color: 0x4ade80,
      moves: ['SPEED JAB', 'BODY BLOW', 'GAZELLE HOOK', 'DEMPSEY FINISHER!'],
      airMove: 'JUMP HOOK',
      lunge: [60, 100, 145, 225],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.55
    },
    ability1: {
      name: 'CORKSCREW',
      notation: '236S',
      cooldown: 1.6,
      lunge: 235,
      callout: 'CORKSCREW HOOK!'
    },
    ability2: {
      name: 'GUARD BREAK',
      notation: '236P',
      cooldown: 2.0,
      lunge: 265,
      callout: 'GUARD BREAKER!',
      chainCallout: 'HEAVYWEIGHT SMASH!'
    },
    ability3: {
      name: 'SONIC WAVE',
      notation: '214P',
      cooldown: 2.6,
      callout: 'SONIC JAB WAVE!',
      projectile: {
        name: 'Sonic Jab Wave',
        shape: 'crescent',
        color: 0x22c55e,
        coreColor: 0xdcfce7,
        speed: 740,
        damage: 12,
        knockback: 280,
        hitstun: 410,
        size: 28
      }
    },
    ability4: {
      name: 'RUSH COMBO',
      notation: '236236K',
      callout: 'CHAMPION RUSH COMBO!'
    }
  },

  'jiujitsu-fighter': {
    characterId: 'jiujitsu-fighter',
    themeColor: 0x14b8a6,
    vfxColor: 0x2dd4bf,
    cutInColor: 'blue',
    domainStyle: 'vortex',
    m1: {
      style: 'martial',
      color: 0x2dd4bf,
      moves: ['SNAP STRIKE', 'CAPOEIRA WHIP', 'CRESCENT KICK', 'SPINNING LAUNCH!'],
      airMove: 'AERIAL AXE KICK',
      lunge: [60, 105, 145, 225],
      stepDamageBonus: [4, 5, 5],
      finisherDamageBonus: 10,
      finisherKnockbackMul: 1.6
    },
    ability1: {
      name: 'TEMPEST KICK',
      notation: '236S',
      cooldown: 1.6,
      lunge: 225,
      callout: 'TEMPEST CRESCENT!'
    },
    ability2: {
      name: 'LOW SWEEP',
      notation: '236P',
      cooldown: 2.0,
      lunge: 255,
      callout: 'CAPOEIRA SWEEP!',
      chainCallout: 'WHIRLWIND FOLLOW-UP!'
    },
    ability3: {
      name: 'CHI PULSE',
      notation: '214P',
      cooldown: 2.6,
      callout: 'CHI PULSE!',
      projectile: {
        name: 'Chi Pulse',
        shape: 'orb',
        color: 0x14b8a6,
        coreColor: 0xccfbf1,
        speed: 710,
        damage: 12,
        knockback: 270,
        hitstun: 420,
        size: 26
      }
    },
    ability4: {
      name: 'SPINAROONI',
      notation: '236236K',
      callout: 'SPINAROONI VORTEX!'
    }
  },

  bayasaa: {
    characterId: 'bayasaa',
    themeColor: 0xfacc15,
    vfxColor: 0xfbbf24,
    cutInColor: 'gold',
    domainStyle: 'vortex',
    m1: {
      style: 'martial',
      color: 0xfacc15,
      moves: ['EAGLE JAB', 'WOLF LOW-KICK', 'STEPPE CRESCENT', 'TORNADO FINISH!'],
      airMove: 'FALCON DROP',
      lunge: [110, 165, 220, 320],
      stepDamageBonus: [8, 10, 12],
      finisherDamageBonus: 22,
      finisherKnockbackMul: 1.85
    },
    ability1: {
      name: 'TORNADO KICK',
      notation: '236S',
      cooldown: 0.55,
      lunge: 380,
      callout: 'STEPPE TORNADO!'
    },
    ability2: {
      name: 'TWIN CRESCENT',
      notation: '236P',
      cooldown: 0.7,
      lunge: 410,
      callout: 'TWIN CRESCENT!',
      chainCallout: 'SKY CLEAVER KICK!'
    },
    ability3: {
      name: 'WOLF WAVE',
      notation: '214P',
      cooldown: 0.85,
      callout: 'WOLF HOWL WAVE!',
      projectile: {
        name: 'Wolf Wave',
        shape: 'crescent',
        color: 0xfacc15,
        coreColor: 0xfef9c3,
        speed: 1120,
        damage: 32,
        knockback: 440,
        hitstun: 620,
        size: 48
      }
    },
    ability4: {
      name: 'CYCLONE BLITZ',
      notation: '236236K',
      callout: 'CYCLONE KICK BLITZ!'
    }
  },

  'vessel-yuji': {
    characterId: 'vessel-yuji',
    themeColor: 0xe11d48,
    vfxColor: 0xf43f5e,
    cutInColor: 'red',
    domainStyle: 'shrine',
    m1: {
      style: 'brawl',
      color: 0xf43f5e,
      moves: ['CURSED JAB', 'DIVERGENT FIST', 'MANJI KICK', 'BLACK FLASH!'],
      airMove: 'DIVERGENT DROP',
      lunge: [65, 110, 150, 235],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 12,
      finisherKnockbackMul: 1.6
    },
    ability1: {
      name: 'CURSED STRIKES',
      notation: '236S',
      cooldown: 1.55,
      lunge: 245,
      callout: 'CURSED STRIKES!'
    },
    ability2: {
      name: 'CRUSHING BLOW',
      notation: '236P',
      cooldown: 2.0,
      lunge: 270,
      callout: 'CRUSHING BLOW!',
      chainCallout: 'BLACK FLASH CHAIN!'
    },
    ability3: {
      name: 'DISMANTLE',
      notation: '214P',
      cooldown: 2.6,
      callout: 'VESSEL DISMANTLE!',
      projectile: {
        name: 'Vessel Dismantle',
        shape: 'crescent',
        color: 0xe11d48,
        coreColor: 0xffe4e6,
        speed: 780,
        damage: 14,
        knockback: 310,
        hitstun: 450,
        size: 32
      }
    },
    ability4: {
      name: 'VESSEL AWAKEN',
      notation: '236236K',
      callout: 'BLACK FLASH AWAKENING!'
    }
  },

  'restless-gambler': {
    characterId: 'restless-gambler',
    themeColor: 0xeab308,
    vfxColor: 0x4ade80,
    cutInColor: 'gold',
    domainStyle: 'cosmic',
    m1: {
      style: 'energy',
      color: 0xfacc15,
      moves: ['ROUGH PUNCH', 'FEVER KNEE', 'DOOR SLAM', 'JACKPOT CRASH!'],
      airMove: 'FEVER DROP',
      lunge: [60, 105, 145, 225],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.55
    },
    ability1: {
      name: 'SHUTTER DOORS',
      notation: '236S',
      cooldown: 1.65,
      lunge: 230,
      callout: 'SHUTTER DOORS!'
    },
    ability2: {
      name: 'ROUGH ENERGY',
      notation: '236P',
      cooldown: 2.0,
      lunge: 265,
      callout: 'ROUGH ENERGY!',
      chainCallout: 'FEVER OVERDRIVE!'
    },
    ability3: {
      name: 'RESERVE BALLS',
      notation: '214P',
      cooldown: 2.5,
      callout: 'RESERVE BALLS!',
      projectile: {
        name: 'Reserve Ball',
        shape: 'orb',
        color: 0x22c55e,
        coreColor: 0xfef08a,
        speed: 740,
        damage: 13,
        knockback: 290,
        hitstun: 440,
        size: 30
      }
    },
    ability4: {
      name: 'DEATH GAMBLE',
      notation: '236236K',
      callout: 'IDLE DEATH GAMBLE: JACKPOT!'
    }
  },

  'hero-hunter': {
    characterId: 'hero-hunter',
    themeColor: 0x0ea5e9,
    vfxColor: 0x38bdf8,
    cutInColor: 'blue',
    domainStyle: 'vortex',
    m1: {
      style: 'martial',
      color: 0x38bdf8,
      moves: ['WATER PALM', 'FLOWING PARRY', 'HUNTER SWEEP', 'CRUSHING FANG!'],
      airMove: 'WHIRLWIND DROP',
      lunge: [70, 115, 155, 240],
      stepDamageBonus: [4, 5, 6],
      finisherDamageBonus: 11,
      finisherKnockbackMul: 1.58
    },
    ability1: {
      name: 'FLOWING WATER',
      notation: '236S',
      cooldown: 1.5,
      lunge: 265,
      callout: 'FLOWING WATER!'
    },
    ability2: {
      name: 'LETHAL WHIRL',
      notation: '236P',
      cooldown: 1.95,
      lunge: 275,
      callout: 'LETHAL WHIRLWIND!',
      chainCallout: 'PREY SLAM!'
    },
    ability3: {
      name: 'HUNTER WAVE',
      notation: '214P',
      cooldown: 2.5,
      callout: 'HUNTER STREAM WAVE!',
      projectile: {
        name: 'Water Stream Wave',
        shape: 'crescent',
        color: 0x0ea5e9,
        coreColor: 0xe0f2fe,
        speed: 820,
        damage: 13,
        knockback: 295,
        hitstun: 440,
        size: 30
      }
    },
    ability4: {
      name: 'WATER STREAM',
      notation: '236236K',
      callout: 'WATER STREAM ROCK SMASHING!'
    }
  },

  anand: {
    characterId: 'anand',
    themeColor: 0x2563eb,
    vfxColor: 0x38bdf8,
    cutInColor: 'gold',
    domainStyle: 'cosmic',
    m1: {
      style: 'energy',
      color: 0x38bdf8,
      moves: ['OVERCLOCK JAB', 'SPARK KICK', 'OPTIC PULSE', 'VOLT FINISHER!'],
      airMove: 'AERO SMASH',
      lunge: [85, 130, 180, 265],
      stepDamageBonus: [6, 7, 8],
      finisherDamageBonus: 15,
      finisherKnockbackMul: 1.7
    },
    ability1: {
      name: 'OVERCLOCK',
      notation: '236S',
      cooldown: 1.05,
      lunge: 295,
      callout: 'OVERCLOCK BLITZ!'
    },
    ability2: {
      name: 'HYPER BLINK',
      notation: '236P',
      cooldown: 1.25,
      lunge: 325,
      callout: 'HYPER BLINK!',
      chainCallout: 'SONIC OPTIC SNAP!'
    },
    ability3: {
      name: 'STAR BEAM',
      notation: '214P',
      cooldown: 1.65,
      callout: 'STARLIGHT BEAM!',
      projectile: {
        name: 'Starlight Beam',
        shape: 'beam',
        color: 0x2563eb,
        coreColor: 0xfef08a,
        speed: 940,
        damage: 20,
        knockback: 360,
        hitstun: 520,
        size: 38
      }
    },
    ability4: {
      name: 'OVERDRIVE',
      notation: '236236K',
      callout: 'INFINITE OVERCLOCK!'
    }
  }
};

export function getHeroAbilityKit(characterId: string): HeroAbilityKit {
  return HERO_ABILITY_KITS[characterId] ?? { ...DEFAULT_KIT, characterId };
}

/**
 * Primary signature ability (slot 1) and meter Super Art / Domain (slot 4)
 * grant damage/hitstun immunity to the user for the duration of the move.
 */
export function isAbilitySlotImmune(abilitySlot: 0 | 1 | 2 | 3 | 4): boolean {
  return abilitySlot === 1 || abilitySlot === 4;
}
