import type { ImageAsset } from './assets';
import type { StagePreviewDebugState } from './types';

/**
 * A full-frame fighting-stage background candidate. Stages are single images
 * (not parallax layers) used by the Stage Preview gym to evaluate framing.
 */
export interface StageDefinition {
  id: string;
  label: string;
  subtitle?: string;
  themeColor?: number;
  key: string;
  url: string;
  width: number;
  height: number;
}

/**
 * The computed placement of a stage when fit to a viewport: vertical-fit scale,
 * resulting on-screen size, and how far it can scroll horizontally.
 */
export interface StageLayout {
  scale: number;
  displayWidth: number;
  displayHeight: number;
  maxScroll: number;
}

export const STAGE_PREVIEW_DEFAULT_PAN_SPEED = 140;
export const STAGE_PREVIEW_MIN_PAN_SPEED = 20;
export const STAGE_PREVIEW_MAX_PAN_SPEED = 600;

const STAGE_ASSET_ROOT = '/assets/backgrounds';

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: 'rooftop-twilight',
    label: 'Rooftop Twilight',
    subtitle: 'Neon City Skyline',
    themeColor: 0x38bdf8,
    key: 'rooftop-twilight-stage',
    url: `${STAGE_ASSET_ROOT}/rooftop-twilight-stage.png`,
    width: 1774,
    height: 887
  },
  {
    id: 'rooftop-sunset',
    label: 'Rooftop Sunset',
    subtitle: 'Golden Helipad',
    themeColor: 0xf59e0b,
    key: 'rooftop-sunset-stage',
    url: `${STAGE_ASSET_ROOT}/rooftop-sunset-stage.png`,
    width: 2048,
    height: 768
  },
  {
    id: 'shrine-ruins',
    label: 'Shrine Ruins',
    subtitle: 'Cursed Torii Courtyard',
    themeColor: 0xef4444,
    key: 'shrine-ruins-stage',
    url: `${STAGE_ASSET_ROOT}/shrine-ruins-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'cyber-dojo',
    label: 'Cyber Dojo',
    subtitle: 'Rainy Neo-Kyoto Deck',
    themeColor: 0x06b6d4,
    key: 'cyber-dojo-stage',
    url: `${STAGE_ASSET_ROOT}/cyber-dojo-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'shinobi-valley',
    label: 'Shinobi Valley',
    subtitle: 'Waterfall Cliffside',
    themeColor: 0xf97316,
    key: 'shinobi-valley-stage',
    url: `${STAGE_ASSET_ROOT}/shinobi-valley-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'frozen-citadel',
    label: 'Frozen Citadel',
    subtitle: 'Aurora Ice Bridge',
    themeColor: 0x7dd3fc,
    key: 'frozen-citadel-stage',
    url: `${STAGE_ASSET_ROOT}/frozen-citadel-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'cosmic-arena',
    label: 'Cosmic Arena',
    subtitle: 'Tournament of Void',
    themeColor: 0xa855f7,
    key: 'cosmic-arena-stage',
    url: `${STAGE_ASSET_ROOT}/cosmic-arena-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'volcanic-caldera',
    label: 'Volcanic Caldera',
    subtitle: 'Molten Obsidian Cavern',
    themeColor: 0xfb923c,
    key: 'volcanic-caldera-stage',
    url: `${STAGE_ASSET_ROOT}/volcanic-caldera-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'steppe-arena',
    label: 'Steppe Monument',
    subtitle: 'Golden Horizon Banners',
    themeColor: 0xfacc15,
    key: 'steppe-arena-stage',
    url: `${STAGE_ASSET_ROOT}/steppe-arena-stage.jpg`,
    width: 1376,
    height: 768
  },
  {
    id: 'fight-club',
    label: 'Fight Club',
    subtitle: 'Underground Ring',
    themeColor: 0x22c55e,
    key: 'fight-club-stage',
    url: `${STAGE_ASSET_ROOT}/fight-club-stage.jpg`,
    width: 1376,
    height: 768
  }
];

const GENERATED_STAGE_KEYS = new Set(['rooftop-twilight-stage', 'rooftop-sunset-stage']);

export const STAGE_IMAGE_ASSETS: ImageAsset[] = STAGE_DEFINITIONS.filter(
  (stage) => !GENERATED_STAGE_KEYS.has(stage.key)
).map((stage) => ({
  kind: 'image',
  key: stage.key,
  url: stage.url,
  width: stage.width,
  height: stage.height,
  usage: `${stage.label} fighting arena background`
}));

export const DEFAULT_STAGE_PREVIEW_STATE: StagePreviewDebugState = {
  stageId: STAGE_DEFINITIONS[0].id,
  scrollX: 0,
  maxScroll: 0,
  displayWidth: 0,
  autoPan: false,
  panSpeed: STAGE_PREVIEW_DEFAULT_PAN_SPEED,
  showGuides: true
};

/**
 * Resolves a stage definition by id, falling back to the first stage when the
 * id is unknown.
 * @param stageId - The stage identifier to resolve.
 * @returns The matching {@link StageDefinition} or the first stage.
 */
export function getStageDefinition(stageId: string): StageDefinition {
  return STAGE_DEFINITIONS.find((stage) => stage.id === stageId) ?? STAGE_DEFINITIONS[0];
}

/**
 * Computes how a stage is placed when fit to the viewport height and centered,
 * including the horizontal scroll range produced by the overflow.
 * @param stageId - The stage to lay out.
 * @param viewportWidth - The game viewport width in pixels.
 * @param viewportHeight - The game viewport height in pixels.
 * @returns The {@link StageLayout} for the stage at this viewport size.
 */
export function getStageLayout(
  stageId: string,
  viewportWidth: number,
  viewportHeight: number
): StageLayout {
  const stage = getStageDefinition(stageId);
  const scale = viewportHeight / stage.height;
  const displayWidth = stage.width * scale;

  return {
    scale,
    displayWidth,
    displayHeight: viewportHeight,
    maxScroll: Math.max(0, displayWidth - viewportWidth)
  };
}

/**
 * Clamps a horizontal scroll value to the valid range for a layout.
 * @param value - The desired scroll position in pixels.
 * @param maxScroll - The maximum scroll for the current stage layout.
 * @returns The clamped scroll position.
 */
export function clampStageScroll(value: number, maxScroll: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(0, maxScroll), Math.max(0, value));
}

/**
 * Clamps a pan speed to the supported range.
 * @param value - The desired pan speed in pixels/second.
 * @returns The clamped pan speed.
 */
export function clampStagePanSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return STAGE_PREVIEW_DEFAULT_PAN_SPEED;
  }

  return Math.min(STAGE_PREVIEW_MAX_PAN_SPEED, Math.max(STAGE_PREVIEW_MIN_PAN_SPEED, Math.round(value)));
}
