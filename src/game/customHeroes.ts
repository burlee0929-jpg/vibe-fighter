import type * as Phaser from 'phaser';

import type { CharacterDefinition, HeroBoundsFrame } from './hero';
import {
  buildFighterCharacter,
  collisionBounds,
  hitBounds,
  rect,
  type FighterActionSpec
} from './fighterCharacter';
import {
  RAW_CELL,
  composeRawSheetFrames,
  frameToCanvas,
  loadFirstImage,
  placeholderRawSheet,
  sliceRawSheet,
  type RawSheet
} from './rawSheet';
import type { Rect } from './types';

interface CustomHeroBlueprint {
  id: string;
  label: string;
  anchorUsage: string;
  cropStancesBottom?: number;
}

const STANDING = rect(76, 28, 104, 204);
const CROUCHING = rect(72, 104, 112, 126);

const HERO_BLUEPRINTS: CustomHeroBlueprint[] = [
  {
    id: 'gojo',
    label: 'Satoru Gojo',
    anchorUsage: 'Satoru Gojo Limitless sorcerer west-facing fighter'
  },
  {
    id: 'naruto',
    label: 'Naruto Uzumaki',
    anchorUsage: 'Naruto Uzumaki Sage shinobi west-facing fighter'
  },
  {
    id: 'cyber-ronin',
    label: 'Cyber Ronin',
    anchorUsage: 'Cyber Ronin neon katana samurai west-facing fighter',
    cropStancesBottom: 0.34
  },
  {
    id: 'goku',
    label: 'Ultra Goku',
    anchorUsage: 'Ultra Goku martial arts ki warrior west-facing fighter'
  },
  {
    id: 'frost-queen',
    label: 'Frost Queen',
    anchorUsage: 'Frost Queen cryo knight mage west-facing fighter'
  },
  {
    id: 'vessel-yuji',
    label: 'Yuji (JJS)',
    anchorUsage: 'Jujutsu Shenanigans blocky Roblox Vessel Yuji cursed brawler west-facing fighter'
  },
  {
    id: 'restless-gambler',
    label: 'Hakari (JJS)',
    anchorUsage: 'Jujutsu Shenanigans blocky Roblox Restless Gambler Hakari jackpot fighter west-facing'
  },
  {
    id: 'hero-hunter',
    label: 'Garou (TSB)',
    anchorUsage: 'The Strongest Battlegrounds blocky Roblox Hero Hunter Garou martial artist west-facing fighter'
  },
  {
    id: 'anand',
    label: 'Anand',
    anchorUsage: 'Anand Overclock prodigy glasses boy blue jacket west-facing fighter'
  }
];

function buildActionSpecs(): FighterActionSpec[] {
  return [
    {
      action: 'idle',
      label: 'Idle',
      file: 'stances-sheet.jpg',
      frames: 4,
      frameRate: 4,
      repeat: -1,
      defaultVisual: STANDING
    },
    {
      action: 'walk-forward',
      label: 'Walk Forward',
      file: 'stances-sheet.jpg',
      frames: 2,
      frameRate: 7,
      repeat: -1,
      defaultVisual: STANDING
    },
    {
      action: 'walk-backward',
      label: 'Walk Backward',
      file: 'stances-sheet.jpg',
      frames: 2,
      frameRate: 7,
      repeat: -1,
      defaultVisual: STANDING
    },
    {
      action: 'crouch',
      label: 'Crouch',
      file: 'stances-sheet.jpg',
      frames: 1,
      frameRate: 10,
      repeat: 0,
      defaultVisual: CROUCHING
    },
    {
      action: 'jump',
      label: 'Jump',
      file: 'combat-sheet.jpg',
      frames: 1,
      frameRate: 10,
      repeat: 0,
      defaultVisual: rect(70, 16, 116, 206)
    },
    {
      action: 'block-high',
      label: 'Block High',
      file: 'stances-sheet.jpg',
      frames: 1,
      frameRate: 10,
      repeat: 0,
      defaultVisual: STANDING,
      guard: rect(56, 36, 144, 128)
    },
    {
      action: 'block-low',
      label: 'Block Low',
      file: 'stances-sheet.jpg',
      frames: 1,
      frameRate: 10,
      repeat: 0,
      defaultVisual: CROUCHING,
      guard: rect(56, 84, 144, 146)
    },
    {
      action: 'hit-high',
      label: 'Hit High',
      file: 'stances-sheet.jpg',
      frames: 2,
      frameRate: 10,
      repeat: 0,
      defaultVisual: STANDING
    },
    {
      action: 'light-punch',
      label: 'Standing Light Punch',
      file: 'combat-sheet.jpg',
      frames: 4,
      frameRate: 16,
      repeat: 0,
      defaultVisual: rect(56, 28, 136, 204),
      attack: { frames: [1, 2], bounds: rect(8, 72, 118, 58) }
    },
    {
      action: 'light-kick',
      label: 'Standing Light Kick',
      file: 'combat-sheet.jpg',
      frames: 4,
      frameRate: 15,
      repeat: 0,
      defaultVisual: rect(48, 28, 148, 204),
      attack: { frames: [1, 2], bounds: rect(4, 62, 124, 68) }
    },
    {
      action: 'crouch-medium-punch',
      label: 'Crouch Medium Strike',
      file: 'combat-sheet.jpg',
      frames: 4,
      frameRate: 15,
      repeat: 0,
      defaultVisual: CROUCHING,
      attack: { frames: [1, 2], bounds: rect(8, 116, 120, 84) }
    },
    {
      action: 'heavy-kick',
      label: 'Heavy Strike',
      file: 'combat-sheet.jpg',
      frames: 5,
      frameRate: 14,
      repeat: 0,
      defaultVisual: rect(42, 28, 160, 204),
      attack: { frames: [1, 2, 3], bounds: rect(2, 58, 132, 90) }
    },
    {
      action: 'jump-heavy-punch',
      label: 'Jump Heavy Strike',
      file: 'combat-sheet.jpg',
      frames: 4,
      frameRate: 14,
      repeat: 0,
      defaultVisual: rect(48, 24, 152, 204),
      attack: { frames: [1, 2], bounds: rect(2, 66, 132, 102) }
    },
    {
      action: 'special-cleave',
      label: 'Signature Ability 1 (236S)',
      file: 'combat-sheet.jpg',
      frames: 5,
      frameRate: 14,
      repeat: 0,
      defaultVisual: rect(36, 24, 176, 208),
      attackSpans: [
        { frames: [1], bounds: rect(0, 52, 148, 112) },
        { frames: [3], bounds: rect(0, 44, 162, 124) }
      ]
    },
    {
      action: 'special-followup',
      label: 'Follow-up Ability 2 (236P)',
      file: 'combat-sheet.jpg',
      frames: 4,
      frameRate: 15,
      repeat: 0,
      defaultVisual: rect(36, 24, 176, 208),
      attack: { frames: [1, 2], bounds: rect(0, 46, 160, 118) }
    },
    {
      action: 'special-arrow',
      label: 'Projectile Ability 3 (214P)',
      file: 'combat-sheet.jpg',
      frames: 5,
      frameRate: 11,
      repeat: 0,
      defaultVisual: rect(48, 28, 156, 204)
    },
    {
      action: 'special-charge',
      label: 'Super Art Charge',
      file: 'combat-sheet.jpg',
      frames: 4,
      frameRate: 12,
      repeat: 0,
      defaultVisual: STANDING
    },
    {
      action: 'special',
      label: 'Super Art',
      file: 'combat-sheet.jpg',
      frames: 9,
      frameRate: 12,
      repeat: 0,
      defaultVisual: rect(24, 20, 204, 212),
      attackSpans: [
        { frames: [1], bounds: rect(0, 36, 200, 170) },
        { frames: [3], bounds: rect(0, 36, 210, 170) },
        { frames: [5], bounds: rect(0, 36, 220, 170) },
        { frames: [7], bounds: rect(0, 24, 232, 188) }
      ]
    },
    {
      action: 'knockdown',
      label: 'Knockdown',
      file: 'stances-sheet.jpg',
      frames: 4,
      frameRate: 8,
      repeat: 0,
      defaultVisual: rect(40, 150, 176, 80)
    }
  ];
}

const SHARED_ACTIONS = buildActionSpecs();

export const CUSTOM_HERO_CHARACTERS: CharacterDefinition[] = HERO_BLUEPRINTS.map((bp) => {
  const character = buildFighterCharacter({
    id: bp.id,
    label: bp.label,
    assetRoot: `/assets/${bp.id}`,
    anchorUsage: bp.anchorUsage,
    portraitFile: 'portrait.jpg',
    actions: SHARED_ACTIONS
  });

  character.assets.forEach((asset) => {
    if (asset.key !== character.portrait.key) {
      asset.auto = true;
    }
  });

  return character;
});

export const CUSTOM_HERO_IDS = HERO_BLUEPRINTS.map((bp) => bp.id);

export async function prepareCustomHeroes(scene: Phaser.Scene): Promise<void> {
  await Promise.all(HERO_BLUEPRINTS.map((bp) => prepareOneCustomHero(scene, bp)));
}

async function prepareOneCustomHero(scene: Phaser.Scene, bp: CustomHeroBlueprint): Promise<void> {
  const character = CUSTOM_HERO_CHARACTERS.find((candidate) => candidate.id === bp.id);
  if (!character) {
    return;
  }

  const root = `/assets/${bp.id}`;
  const [stancesImg, combatImg] = await Promise.all([
    loadFirstImage([`${root}/stances-sheet.jpg`]),
    loadFirstImage([`${root}/combat-sheet.jpg`])
  ]);

  const stances =
    (stancesImg &&
      sliceRawSheet(stancesImg, {
        flip: true,
        frames: 4,
        cropBottomFraction: bp.cropStancesBottom
      })) ||
    placeholderRawSheet();
  const combat =
    (combatImg && sliceRawSheet(combatImg, { flip: true, frames: 4, scaleMode: 'per-pose' })) ||
    placeholderRawSheet();

  // Stances frames: 0=idle, 1=dash/walk, 2=crouch/block, 3=hit/ko
  // Combat frames:  0=light strike, 1=heavy strike, 2=jump strike, 3=special release
  const composed: Record<string, RawSheet> = {
    idle: composeRawSheetFrames([
      { sheet: stances, frame: 0 },
      { sheet: stances, frame: 0 },
      { sheet: stances, frame: 1 },
      { sheet: stances, frame: 0 }
    ]),
    'walk-forward': composeRawSheetFrames([
      { sheet: stances, frame: 1 },
      { sheet: stances, frame: 0 }
    ]),
    'walk-backward': composeRawSheetFrames([
      { sheet: stances, frame: 0 },
      { sheet: stances, frame: 1 }
    ]),
    crouch: composeRawSheetFrames([{ sheet: stances, frame: 2 }]),
    jump: composeRawSheetFrames([{ sheet: combat, frame: 2 }]),
    'block-high': composeRawSheetFrames([{ sheet: stances, frame: 2 }]),
    'block-low': composeRawSheetFrames([{ sheet: stances, frame: 2 }]),
    'hit-high': composeRawSheetFrames([
      { sheet: stances, frame: 3 },
      { sheet: stances, frame: 3 }
    ]),
    'light-punch': composeRawSheetFrames([
      { sheet: stances, frame: 0 },
      { sheet: combat, frame: 0 },
      { sheet: combat, frame: 0 },
      { sheet: stances, frame: 0 }
    ]),
    'light-kick': composeRawSheetFrames([
      { sheet: stances, frame: 0 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 1 },
      { sheet: stances, frame: 0 }
    ]),
    'crouch-medium-punch': composeRawSheetFrames([
      { sheet: stances, frame: 2 },
      { sheet: combat, frame: 0 },
      { sheet: combat, frame: 0 },
      { sheet: stances, frame: 2 }
    ]),
    'heavy-kick': composeRawSheetFrames([
      { sheet: stances, frame: 1 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 1 },
      { sheet: stances, frame: 0 }
    ]),
    'jump-heavy-punch': composeRawSheetFrames([
      { sheet: combat, frame: 2 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 2 }
    ]),
    'special-cleave': composeRawSheetFrames([
      { sheet: stances, frame: 1 },
      { sheet: combat, frame: 0 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 3 },
      { sheet: stances, frame: 0 }
    ]),
    'special-followup': composeRawSheetFrames([
      { sheet: stances, frame: 1 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 3 },
      { sheet: stances, frame: 0 }
    ]),
    'special-arrow': composeRawSheetFrames([
      { sheet: stances, frame: 0 },
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 3 },
      { sheet: stances, frame: 0 }
    ]),
    'special-charge': composeRawSheetFrames([
      { sheet: stances, frame: 2 },
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 3 }
    ]),
    special: composeRawSheetFrames([
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 0 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 3 },
      { sheet: combat, frame: 1 },
      { sheet: combat, frame: 3 },
      { sheet: stances, frame: 0 }
    ]),
    knockdown: composeRawSheetFrames([
      { sheet: stances, frame: 3 },
      { sheet: stances, frame: 3 },
      { sheet: stances, frame: 3 },
      { sheet: stances, frame: 3 }
    ])
  };

  for (const spec of SHARED_ACTIONS) {
    const sheet = composed[spec.action];
    const animation = character.animations.find((candidate) => candidate.action === spec.action);

    if (!sheet || !animation) {
      continue;
    }

    animation.sheet.frames = sheet.frames;
    animation.bounds = buildActionBounds(spec, sheet);

    if (scene.textures.exists(animation.sheet.key)) {
      scene.textures.remove(animation.sheet.key);
    }

    scene.textures.addSpriteSheet(animation.sheet.key, sheet.canvas as unknown as HTMLImageElement, {
      frameWidth: RAW_CELL,
      frameHeight: RAW_CELL,
      startFrame: 0,
      endFrame: sheet.frames - 1
    });
  }

  if (scene.textures.exists(character.anchorAsset.key)) {
    scene.textures.remove(character.anchorAsset.key);
  }
  scene.textures.addCanvas(character.anchorAsset.key, frameToCanvas(stances, 0));
}

function buildActionBounds(spec: FighterActionSpec, sheet: RawSheet): HeroBoundsFrame[] {
  const isCrouch = spec.action === 'crouch' || spec.action === 'crouch-medium-punch' || spec.action === 'block-low';
  const body = isCrouch ? CROUCHING : STANDING;
  const attackMap = new Map<number, Rect>();

  if (spec.attack) {
    spec.attack.frames.forEach((f) => attackMap.set(f, spec.attack!.bounds));
  }
  (spec.attackSpans ?? []).forEach((span) => {
    span.frames.forEach((f) => attackMap.set(f, span.bounds));
  });

  return sheet.boxes.map((box, frame) => ({
    frame,
    visual: { ...box },
    collision: collisionBounds(body, RAW_CELL, RAW_CELL),
    hit: hitBounds(box, RAW_CELL, RAW_CELL),
    attack: attackMap.get(frame) ?? null,
    guard: spec.guard ? { ...spec.guard } : null
  }));
}
