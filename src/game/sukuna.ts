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

export const SUKUNA_CHARACTER_ID = 'sukuna';

const ASSET_ROOT = '/assets/sukuna';
const STANDING = rect(76, 28, 104, 204);
const CROUCHING = rect(72, 104, 112, 126);

const SUKUNA_ACTIONS: FighterActionSpec[] = [
  {
    action: 'idle',
    label: 'Idle',
    file: 'idle-walk-sheet.jpg',
    frames: 4,
    frameRate: 4,
    repeat: -1,
    defaultVisual: STANDING
  },
  {
    action: 'walk-forward',
    label: 'Walk Forward',
    file: 'idle-walk-sheet.jpg',
    frames: 2,
    frameRate: 6,
    repeat: -1,
    defaultVisual: STANDING
  },
  {
    action: 'walk-backward',
    label: 'Walk Backward',
    file: 'idle-walk-sheet.jpg',
    frames: 2,
    frameRate: 6,
    repeat: -1,
    defaultVisual: STANDING
  },
  {
    action: 'crouch',
    label: 'Crouch',
    file: 'defense-sheet.jpg',
    frames: 1,
    frameRate: 10,
    repeat: 0,
    defaultVisual: CROUCHING
  },
  {
    action: 'jump',
    label: 'Jump',
    file: 'defense-sheet.jpg',
    frames: 1,
    frameRate: 10,
    repeat: 0,
    defaultVisual: rect(70, 16, 116, 206)
  },
  {
    action: 'block-high',
    label: 'Block High',
    file: 'defense-sheet.jpg',
    frames: 1,
    frameRate: 10,
    repeat: 0,
    defaultVisual: STANDING,
    guard: rect(56, 36, 144, 128)
  },
  {
    action: 'block-low',
    label: 'Block Low',
    file: 'defense-sheet.jpg',
    frames: 1,
    frameRate: 10,
    repeat: 0,
    defaultVisual: CROUCHING,
    guard: rect(56, 84, 144, 146)
  },
  {
    action: 'hit-high',
    label: 'Hit High',
    file: 'defense-sheet.jpg',
    frames: 2,
    frameRate: 10,
    repeat: 0,
    defaultVisual: STANDING
  },
  {
    action: 'light-punch',
    label: 'Standing Light Punch',
    file: 'attacks-sheet.jpg',
    frames: 4,
    frameRate: 16,
    repeat: 0,
    defaultVisual: rect(56, 28, 136, 204),
    attack: { frames: [1, 2], bounds: rect(8, 72, 118, 58) }
  },
  {
    action: 'light-kick',
    label: 'Standing Light Kick',
    file: 'attacks-sheet.jpg',
    frames: 4,
    frameRate: 15,
    repeat: 0,
    defaultVisual: rect(48, 28, 148, 204),
    attack: { frames: [1, 2], bounds: rect(4, 62, 124, 68) }
  },
  {
    action: 'crouch-medium-punch',
    label: 'Crouch Medium Punch',
    file: 'attacks-sheet.jpg',
    frames: 4,
    frameRate: 15,
    repeat: 0,
    defaultVisual: CROUCHING,
    attack: { frames: [1, 2], bounds: rect(8, 120, 120, 80) }
  },
  {
    action: 'heavy-kick',
    label: 'Heavy Slash Punch',
    file: 'attacks-sheet.jpg',
    frames: 5,
    frameRate: 14,
    repeat: 0,
    defaultVisual: rect(42, 28, 160, 204),
    attack: { frames: [1, 2, 3], bounds: rect(2, 58, 132, 90) }
  },
  {
    action: 'jump-heavy-punch',
    label: 'Jump Heavy Punch',
    file: 'attacks-sheet.jpg',
    frames: 4,
    frameRate: 14,
    repeat: 0,
    defaultVisual: rect(48, 24, 152, 204),
    attack: { frames: [1, 2], bounds: rect(2, 66, 132, 102) }
  },
  {
    action: 'special-cleave',
    label: 'Cleave / Dismemberment (236S)',
    file: 'specials-sheet.jpg',
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
    label: 'Follow-up Slash (236P)',
    file: 'attacks-sheet.jpg',
    frames: 4,
    frameRate: 15,
    repeat: 0,
    defaultVisual: rect(36, 24, 176, 208),
    attack: { frames: [1, 2], bounds: rect(0, 46, 160, 118) }
  },
  {
    action: 'special-arrow',
    label: 'Arrow Launch: Fuga (214P)',
    file: 'specials-sheet.jpg',
    frames: 5,
    frameRate: 11,
    repeat: 0,
    defaultVisual: rect(48, 28, 156, 204)
  },
  {
    action: 'special-charge',
    label: 'Domain Sign Charge',
    file: 'specials-sheet.jpg',
    frames: 4,
    frameRate: 12,
    repeat: 0,
    defaultVisual: STANDING
  },
  {
    action: 'special',
    label: 'Super Art: Malevolent Shrine',
    file: 'specials-sheet.jpg',
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
    file: 'specials-sheet.jpg',
    frames: 4,
    frameRate: 8,
    repeat: 0,
    defaultVisual: rect(40, 150, 176, 80)
  }
];

export const SUKUNA_CHARACTER: CharacterDefinition = (() => {
  const character = buildFighterCharacter({
    id: SUKUNA_CHARACTER_ID,
    label: 'Ryomen Sukuna',
    assetRoot: ASSET_ROOT,
    anchorUsage: 'Ryomen Sukuna King of Curses west-facing fighter',
    portraitFile: 'portrait.jpg',
    actions: SUKUNA_ACTIONS
  });

  // Spritesheets and anchor textures are sliced in browser at boot; portrait.jpg loads directly.
  character.assets.forEach((asset) => {
    if (asset.key !== character.portrait.key) {
      asset.auto = true;
    }
  });

  return character;
})();

/**
 * Loads Ryomen Sukuna's 4 multi-pose green-screen sheets at boot, keys out the
 * green chroma background, normalizes all poses to the canonical 256x256
 * west-facing frame layout, and registers all Phaser spritesheet textures.
 */
export async function prepareSukunaCharacter(scene: Phaser.Scene): Promise<void> {
  const [idleWalkImg, attacksImg, defenseImg, specialsImg] = await Promise.all([
    loadFirstImage([`${ASSET_ROOT}/idle-walk-sheet.jpg`]),
    loadFirstImage([`${ASSET_ROOT}/attacks-sheet.jpg`]),
    loadFirstImage([`${ASSET_ROOT}/defense-sheet.jpg`]),
    loadFirstImage([`${ASSET_ROOT}/specials-sheet.jpg`])
  ]);

  const idleWalk = (idleWalkImg && sliceRawSheet(idleWalkImg, { flip: true, frames: 4 })) || placeholderRawSheet();
  const attacks = (attacksImg && sliceRawSheet(attacksImg, { flip: true, frames: 4 })) || placeholderRawSheet();
  const defense = (defenseImg && sliceRawSheet(defenseImg, { flip: true, frames: 4 })) || placeholderRawSheet();
  const specials =
    (specialsImg && sliceRawSheet(specialsImg, { flip: true, frames: 4, scaleMode: 'per-pose' })) ||
    placeholderRawSheet();

  const composed: Record<string, RawSheet> = {
    idle: composeRawSheetFrames([
      { sheet: idleWalk, frame: 0 },
      { sheet: idleWalk, frame: 0 },
      { sheet: idleWalk, frame: 1 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'walk-forward': composeRawSheetFrames([
      { sheet: idleWalk, frame: 2 },
      { sheet: idleWalk, frame: 3 }
    ]),
    'walk-backward': composeRawSheetFrames([
      { sheet: idleWalk, frame: 3 },
      { sheet: idleWalk, frame: 2 }
    ]),
    crouch: composeRawSheetFrames([{ sheet: defense, frame: 1 }]),
    jump: composeRawSheetFrames([{ sheet: defense, frame: 2 }]),
    'block-high': composeRawSheetFrames([{ sheet: defense, frame: 0 }]),
    'block-low': composeRawSheetFrames([{ sheet: defense, frame: 0 }]),
    'hit-high': composeRawSheetFrames([
      { sheet: defense, frame: 3 },
      { sheet: defense, frame: 3 }
    ]),
    'light-punch': composeRawSheetFrames([
      { sheet: idleWalk, frame: 1 },
      { sheet: attacks, frame: 0 },
      { sheet: attacks, frame: 0 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'light-kick': composeRawSheetFrames([
      { sheet: idleWalk, frame: 1 },
      { sheet: attacks, frame: 1 },
      { sheet: attacks, frame: 1 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'crouch-medium-punch': composeRawSheetFrames([
      { sheet: defense, frame: 1 },
      { sheet: attacks, frame: 2 },
      { sheet: attacks, frame: 2 },
      { sheet: defense, frame: 1 }
    ]),
    'heavy-kick': composeRawSheetFrames([
      { sheet: idleWalk, frame: 1 },
      { sheet: attacks, frame: 3 },
      { sheet: attacks, frame: 3 },
      { sheet: attacks, frame: 3 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'jump-heavy-punch': composeRawSheetFrames([
      { sheet: defense, frame: 2 },
      { sheet: attacks, frame: 3 },
      { sheet: attacks, frame: 3 },
      { sheet: defense, frame: 2 }
    ]),
    'special-cleave': composeRawSheetFrames([
      { sheet: specials, frame: 0 },
      { sheet: attacks, frame: 3 },
      { sheet: idleWalk, frame: 1 },
      { sheet: specials, frame: 2 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'special-followup': composeRawSheetFrames([
      { sheet: attacks, frame: 0 },
      { sheet: attacks, frame: 3 },
      { sheet: specials, frame: 2 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'special-arrow': composeRawSheetFrames([
      { sheet: specials, frame: 0 },
      { sheet: specials, frame: 1 },
      { sheet: specials, frame: 1 },
      { sheet: specials, frame: 1 },
      { sheet: idleWalk, frame: 1 }
    ]),
    'special-charge': composeRawSheetFrames([
      { sheet: specials, frame: 0 },
      { sheet: specials, frame: 0 },
      { sheet: specials, frame: 0 },
      { sheet: specials, frame: 0 }
    ]),
    special: composeRawSheetFrames([
      { sheet: specials, frame: 0 },
      { sheet: specials, frame: 2 },
      { sheet: attacks, frame: 3 },
      { sheet: specials, frame: 2 },
      { sheet: attacks, frame: 3 },
      { sheet: specials, frame: 2 },
      { sheet: specials, frame: 0 },
      { sheet: specials, frame: 2 },
      { sheet: idleWalk, frame: 1 }
    ]),
    knockdown: composeRawSheetFrames([
      { sheet: defense, frame: 3 },
      { sheet: specials, frame: 3 },
      { sheet: specials, frame: 3 },
      { sheet: specials, frame: 3 }
    ])
  };

  for (const spec of SUKUNA_ACTIONS) {
    const sheet = composed[spec.action];
    const animation = SUKUNA_CHARACTER.animations.find((candidate) => candidate.action === spec.action);

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

  if (scene.textures.exists(SUKUNA_CHARACTER.anchorAsset.key)) {
    scene.textures.remove(SUKUNA_CHARACTER.anchorAsset.key);
  }
  scene.textures.addCanvas(SUKUNA_CHARACTER.anchorAsset.key, frameToCanvas(idleWalk, 0));
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
