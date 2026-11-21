import type { Rect } from './types';

/**
 * Turns a "raw" AI-drawn pose sheet (a row or grid of poses on one flat
 * background colour) into a game-ready spritesheet canvas: background removed,
 * every pose scaled to the same body height, feet on the same line, one pose
 * per 256x256 cell, 5 cells per row.
 */

export const RAW_CELL = 256;
export const RAW_COLS = 5;
/** Feet line and standing body height shared with the bundled fighters. */
const FEET_Y = 229;
const BODY_HEIGHT = 200;
const MAX_POSE_WIDTH = 250;
const MAX_FRAMES = 10;
const MAX_SOURCE_SIDE = 2048;

export interface RawSheet {
  canvas: HTMLCanvasElement;
  frames: number;
  /** Tight box around each pose inside its 256x256 cell. */
  boxes: Rect[];
}

export interface RawSheetOptions {
  /** Mirror every pose. Use when the art faces right instead of left. */
  flip?: boolean;
  /** Force this many equal-width poses instead of auto-detecting them. */
  frames?: number;
  /** Optional fraction of image height to trim from the bottom before slicing (e.g. 0.33). */
  cropBottomFraction?: number;
  /**
   * How pose scales are chosen:
   * - 'uniform' (default): shared sheet scale so crouch/knockdown poses keep proportions,
   *   excluding flat lying-down poses from clamping standing pose widths.
   * - 'per-pose': scale each upright/action pose independently to BODY_HEIGHT (capped by MAX_POSE_WIDTH)
   *   so wide attacks, extended limbs, or tall jumps/auras do not shrink other ability poses.
   */
  scaleMode?: 'uniform' | 'per-pose';
}

export interface Pose {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  feetX: number;
  /** Optional component label id(s) inside `labelMap` to mask out neighboring overlapping poses. */
  componentIds?: Set<number>;
}

export interface DetectedPosesResult {
  poses: Pose[];
  labelMap: Int32Array | null;
}

/**
 * Load the first URL that decodes as an image.
 * @param urls - Candidate URLs, tried in order.
 */
export async function loadFirstImage(urls: string[]): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    const image = await loadImage(url);

    if (image) {
      return image;
    }
  }

  return null;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve(image.naturalWidth > 0 ? image : null);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Slice a raw pose sheet into a normalized spritesheet.
 * @param image - The decoded source image.
 * @param options - Flip, frame-count, crop, and scale overrides.
 * @returns The spritesheet, or null when no pose was found.
 */
export function sliceRawSheet(image: HTMLImageElement, options: RawSheetOptions = {}): RawSheet | null {
  const shrink = Math.min(1, MAX_SOURCE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * shrink));
  const fullHeight = Math.max(1, Math.round(image.naturalHeight * shrink));
  const cropBottom = Math.max(0, Math.min(0.6, options.cropBottomFraction ?? 0));
  const height = Math.max(1, Math.round(fullHeight * (1 - cropBottom)));
  const srcHeight = Math.max(1, Math.round(image.naturalHeight * (1 - cropBottom)));
  const source = makeCanvas(width, height);
  const sourceContext = source.getContext('2d', { willReadFrequently: true });

  if (!sourceContext) {
    return null;
  }

  sourceContext.drawImage(image, 0, 0, image.naturalWidth, srcHeight, 0, 0, width, height);

  const pixels = sourceContext.getImageData(0, 0, width, height);

  removeBackground(pixels.data, width, height);
  sourceContext.putImageData(pixels, 0, 0);

  const mask = new Uint8Array(width * height);

  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = pixels.data[index * 4 + 3] > 40 ? 1 : 0;
  }

  const { poses: rawPoses, labelMap } = detectSheetPoses(mask, width, height, options.frames);
  const poses = rawPoses.slice(0, MAX_FRAMES);

  if (poses.length === 0) {
    return null;
  }

  const scales = computePoseScales(poses, { scaleMode: options.scaleMode });
  const rows = Math.ceil(poses.length / RAW_COLS);
  const canvas = makeCanvas(RAW_COLS * RAW_CELL, rows * RAW_CELL);
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const scratch = makeCanvas(1, 1);
  const scratchCtx = scratch.getContext('2d');

  const boxes = poses.map((pose, frame) => {
    const scale = scales[frame];
    const drawWidth = Math.max(1, Math.round(pose.width * scale));
    const drawHeight = Math.max(1, Math.round(pose.height * scale));
    const centered = Math.round(RAW_CELL / 2 - (pose.feetX - pose.x) * scale);
    const left = Math.max(2, Math.min(RAW_CELL - 2 - drawWidth, centered));
    const top = FEET_Y - drawHeight;
    const cellX = (frame % RAW_COLS) * RAW_CELL;
    const cellY = Math.floor(frame / RAW_COLS) * RAW_CELL;

    context.save();

    if (options.flip) {
      context.translate(cellX + RAW_CELL, cellY);
      context.scale(-1, 1);
    } else {
      context.translate(cellX, cellY);
    }

    if (labelMap && pose.componentIds && scratchCtx) {
      scratch.width = pose.width;
      scratch.height = pose.height;
      const isolated = scratchCtx.createImageData(pose.width, pose.height);
      const dst = isolated.data;
      const src = pixels.data;
      const ids = pose.componentIds;

      for (let py = 0; py < pose.height; py += 1) {
        const sy = pose.y + py;
        for (let px = 0; px < pose.width; px += 1) {
          const sx = pose.x + px;
          const sIdx = sy * width + sx;
          if (ids.has(labelMap[sIdx])) {
            const sOff = sIdx * 4;
            const dOff = (py * pose.width + px) * 4;
            dst[dOff] = src[sOff];
            dst[dOff + 1] = src[sOff + 1];
            dst[dOff + 2] = src[sOff + 2];
            dst[dOff + 3] = src[sOff + 3];
          }
        }
      }

      scratchCtx.putImageData(isolated, 0, 0);
      context.drawImage(scratch, 0, 0, pose.width, pose.height, left, top, drawWidth, drawHeight);
    } else {
      context.drawImage(source, pose.x, pose.y, pose.width, pose.height, left, top, drawWidth, drawHeight);
    }

    context.restore();

    return {
      x: options.flip ? RAW_CELL - left - drawWidth : left,
      y: top,
      width: drawWidth,
      height: drawHeight
    };
  });

  return { canvas, frames: poses.length, boxes };
}

/**
 * Compute per-pose normalization scales so wide lying-down poses never shrink
 * standing poses, and `'per-pose'` action sheets keep every action pose full-sized.
 */
export function computePoseScales(
  poses: Array<Pick<Pose, 'width' | 'height'>>,
  options: { scaleMode?: 'uniform' | 'per-pose'; targetHeight?: number; maxWidth?: number } = {}
): number[] {
  if (poses.length === 0) {
    return [];
  }

  const targetHeight = options.targetHeight ?? BODY_HEIGHT;
  const maxWidth = options.maxWidth ?? MAX_POSE_WIDTH;
  const tallest = Math.max(...poses.map((pose) => pose.height));
  const isLying = (pose: Pick<Pose, 'width' | 'height'>): boolean =>
    pose.width > pose.height * 1.65 && pose.height < tallest * 0.5;

  const uprightPoses = poses.filter((pose) => !isLying(pose));
  const widestUpright = Math.max(...(uprightPoses.length > 0 ? uprightPoses : poses).map((pose) => pose.width));
  const uniformScale = Math.min(targetHeight / Math.max(1, tallest), maxWidth / Math.max(1, widestUpright));

  if (options.scaleMode === 'per-pose') {
    return poses.map((pose) =>
      isLying(pose)
        ? Math.min(uniformScale, maxWidth / Math.max(1, pose.width))
        : Math.min(targetHeight / Math.max(1, pose.height), maxWidth / Math.max(1, pose.width))
    );
  }

  return poses.map((pose) => Math.min(uniformScale, maxWidth / Math.max(1, pose.width)));
}

/**
 * Segment foreground poses cleanly:
 * 1. Try 1D band/column separation when it already matches `expectedFrames` (or no count is fixed).
 * 2. When `expectedFrames` is specified and 1D columns overlap, use 2D 8-connected components
 *    (attaching small detached blades/auras/sparks to the nearest pose seed) so overlapping
 *    kicks, hands, or lying knockdowns stay cleanly separated.
 * 3. Fall back to valley-cut splitting around even intervals if poses still touch in 2D.
 */
export function detectSheetPoses(
  mask: Uint8Array,
  width: number,
  height: number,
  expectedFrames?: number
): DetectedPosesResult {
  const detected = findPoses(mask, width, height);

  if (!expectedFrames || detected.length === expectedFrames) {
    return { poses: detected, labelMap: null };
  }

  const componentResult = extractComponentPoses(mask, width, height, expectedFrames);
  if (componentResult) {
    return componentResult;
  }

  return { poses: splitByValleys(mask, width, height, expectedFrames), labelMap: null };
}

/**
 * Copy a spritesheet with its frames in reverse order (walk -> walk backward).
 * @param sheet - The sheet to reverse.
 */
export function reverseRawSheet(sheet: RawSheet): RawSheet {
  const canvas = makeCanvas(sheet.canvas.width, sheet.canvas.height);
  const context = canvas.getContext('2d');

  for (let frame = 0; frame < sheet.frames; frame += 1) {
    const from = sheet.frames - 1 - frame;

    context?.drawImage(
      sheet.canvas,
      (from % RAW_COLS) * RAW_CELL,
      Math.floor(from / RAW_COLS) * RAW_CELL,
      RAW_CELL,
      RAW_CELL,
      (frame % RAW_COLS) * RAW_CELL,
      Math.floor(frame / RAW_COLS) * RAW_CELL,
      RAW_CELL,
      RAW_CELL
    );
  }

  return { canvas, frames: sheet.frames, boxes: [...sheet.boxes].reverse() };
}

/**
 * Assemble a new spritesheet by picking specific frames from one or more sliced
 * pose sheets (used when multi-move sheets are authored on a shared canvas).
 * @param entries - Ordered list of `{ sheet, frame }` picks (up to MAX_FRAMES).
 */
export function composeRawSheetFrames(entries: Array<{ sheet: RawSheet; frame: number }>): RawSheet {
  const picks = entries.slice(0, MAX_FRAMES);
  const rows = Math.max(1, Math.ceil(picks.length / RAW_COLS));
  const canvas = makeCanvas(RAW_COLS * RAW_CELL, rows * RAW_CELL);
  const context = canvas.getContext('2d');
  const boxes: Rect[] = [];

  picks.forEach((entry, index) => {
    const safeFrame = Math.max(0, Math.min(entry.sheet.frames - 1, entry.frame));
    const sx = (safeFrame % RAW_COLS) * RAW_CELL;
    const sy = Math.floor(safeFrame / RAW_COLS) * RAW_CELL;
    const dx = (index % RAW_COLS) * RAW_CELL;
    const dy = Math.floor(index / RAW_COLS) * RAW_CELL;

    context?.drawImage(entry.sheet.canvas, sx, sy, RAW_CELL, RAW_CELL, dx, dy, RAW_CELL, RAW_CELL);
    boxes.push({ ...entry.sheet.boxes[safeFrame] });
  });

  return { canvas, frames: picks.length, boxes };
}

/**
 * Cut one frame out of a spritesheet as a square image (used for portraits).
 * @param sheet - The source sheet.
 * @param frame - Frame index to copy.
 */
export function frameToCanvas(sheet: RawSheet, frame = 0): HTMLCanvasElement {
  const canvas = makeCanvas(RAW_CELL, RAW_CELL);

  canvas
    .getContext('2d')
    ?.drawImage(
      sheet.canvas,
      (frame % RAW_COLS) * RAW_CELL,
      Math.floor(frame / RAW_COLS) * RAW_CELL,
      RAW_CELL,
      RAW_CELL,
      0,
      0,
      RAW_CELL,
      RAW_CELL
    );

  return canvas;
}

/**
 * A stand-in sheet (one grey silhouette with a question mark) for a fighter
 * whose images are missing, so the game still runs.
 */
export function placeholderRawSheet(): RawSheet {
  const canvas = makeCanvas(RAW_COLS * RAW_CELL, RAW_CELL);
  const context = canvas.getContext('2d');
  const box = { x: 88, y: FEET_Y - BODY_HEIGHT, width: 80, height: BODY_HEIGHT };

  if (context) {
    context.fillStyle = '#64748b';
    context.fillRect(box.x, box.y + 50, box.width, box.height - 50);
    context.beginPath();
    context.arc(RAW_CELL / 2, box.y + 26, 26, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f8fafc';
    context.font = 'bold 64px monospace';
    context.textAlign = 'center';
    context.fillText('?', RAW_CELL / 2, box.y + 140);
  }

  return { canvas, frames: 1, boxes: [box] };
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

/**
 * Make the flat background transparent. The background colour is read from the
 * image border, so green, magenta or white backgrounds all work. Images that
 * are already transparent are left alone.
 */
function removeBackground(data: Uint8ClampedArray, width: number, height: number): void {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];

  if (corners.some((corner) => data[corner * 4 + 3] < 16)) {
    return;
  }

  const [red, green, blue] = borderColour(data, width, height);
  const greenScreen = green > red + 50 && green > blue + 50;
  const solid = 85;
  const soft = 135;

  for (let offset = 0; offset < data.length; offset += 4) {
    const distance = Math.hypot(data[offset] - red, data[offset + 1] - green, data[offset + 2] - blue);

    if (distance < solid) {
      data[offset + 3] = 0;
    } else if (distance < soft) {
      data[offset + 3] = Math.round(((distance - solid) / (soft - solid)) * 255);

      if (greenScreen) {
        data[offset + 1] = Math.min(data[offset + 1], Math.max(data[offset], data[offset + 2]));
      }
    }
  }
}

function borderColour(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const samples: Array<[number, number, number]> = [];
  const push = (x: number, y: number): void => {
    const offset = (y * width + x) * 4;

    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };

  for (let x = 0; x < width; x += 8) {
    push(x, 0);
    push(x, height - 1);
  }

  for (let y = 0; y < height; y += 8) {
    push(0, y);
    push(width - 1, y);
  }

  const median = (channel: 0 | 1 | 2): number =>
    samples.map((sample) => sample[channel]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];

  return [median(0), median(1), median(2)];
}

/**
 * Find the poses: split the image into rows of poses, then each row into
 * poses, using the empty background between them. Small specks and text
 * labels are ignored.
 */
function findPoses(mask: Uint8Array, width: number, height: number): Pose[] {
  const rowCounts = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rowCounts[y] += mask[y * width + x];
    }
  }

  const bands = findRuns(rowCounts, Math.max(2, width * 0.003), Math.max(4, height * 0.015));
  const tallestBand = Math.max(0, ...bands.map(([start, end]) => end - start));
  const poses: Pose[] = [];

  bands
    .filter(([start, end]) => end - start >= tallestBand * 0.3)
    .forEach(([bandTop, bandBottom]) => {
      const columnCounts = new Array<number>(width).fill(0);

      for (let y = bandTop; y < bandBottom; y += 1) {
        for (let x = 0; x < width; x += 1) {
          columnCounts[x] += mask[y * width + x];
        }
      }

      findRuns(columnCounts, 2, Math.max(4, width * 0.01)).forEach(([left, right]) => {
        const pose = measurePose(mask, width, left, right, bandTop, bandBottom);

        if (pose) {
          poses.push(pose);
        }
      });
    });

  const areas = poses.map((pose) => pose.area).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)] ?? 0;

  return poses.filter((pose) => pose.area >= medianArea * 0.12);
}

/**
 * Segment poses using 2D 8-connected components when horizontal columns overlap
 * (e.g. a high kick extending above a jump pose, or a hand reaching above a lying knockdown).
 * Detached blades/sparks/effects are attached to the nearest major pose component.
 */
function extractComponentPoses(
  mask: Uint8Array,
  width: number,
  height: number,
  expectedFrames: number
): DetectedPosesResult | null {
  const total = width * height;
  const labelMap = new Int32Array(total);
  const queue = new Int32Array(total);
  const comps: Array<{
    id: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    area: number;
  }> = [];

  let nextId = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || labelMap[start] !== 0) {
        continue;
      }

      const id = nextId;
      nextId += 1;
      let head = 0;
      let tail = 0;
      queue[tail] = start;
      tail += 1;
      labelMap[start] = id;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const idx = queue[head];
        head += 1;
        const cx = idx % width;
        const cy = (idx / width) | 0;
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (mask[nIdx] && labelMap[nIdx] === 0) {
              labelMap[nIdx] = id;
              queue[tail] = nIdx;
              tail += 1;
            }
          }
        }
      }

      if (area >= 12) {
        comps.push({ id, minX, maxX, minY, maxY, area });
      }
    }
  }

  if (comps.length < expectedFrames) {
    return null;
  }

  comps.sort((a, b) => b.area - a.area);
  const largestArea = comps[0].area;
  const seedSlice = comps.slice(0, expectedFrames);
  if (seedSlice[expectedFrames - 1].area < largestArea * 0.14) {
    return null;
  }

  const groups = seedSlice
    .map((seed) => ({
      minX: seed.minX,
      maxX: seed.maxX,
      minY: seed.minY,
      maxY: seed.maxY,
      area: seed.area,
      ids: new Set<number>([seed.id])
    }))
    .sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2);

  const maxAttachDist = Math.max(24, (width / expectedFrames) * 0.55);
  const minAttachArea = Math.max(16, largestArea * 0.002);

  for (let i = expectedFrames; i < comps.length; i += 1) {
    const comp = comps[i];
    if (comp.area < minAttachArea) {
      continue;
    }

    let bestGroup: (typeof groups)[number] | null = null;
    let bestDist = Infinity;

    for (const group of groups) {
      const dx = Math.max(0, group.minX - comp.maxX, comp.minX - group.maxX);
      const dy = Math.max(0, group.minY - comp.maxY, comp.minY - group.maxY);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestGroup = group;
      }
    }

    if (bestGroup && bestDist <= maxAttachDist) {
      bestGroup.ids.add(comp.id);
      bestGroup.minX = Math.min(bestGroup.minX, comp.minX);
      bestGroup.maxX = Math.max(bestGroup.maxX, comp.maxX);
      bestGroup.minY = Math.min(bestGroup.minY, comp.minY);
      bestGroup.maxY = Math.max(bestGroup.maxY, comp.maxY);
      bestGroup.area += comp.area;
    }
  }

  const poses: Pose[] = groups.map((group) => {
    const poseHeight = group.maxY - group.minY + 1;
    const feetTop = group.maxY - Math.max(2, Math.round(poseHeight * 0.1));
    let feetLeft = group.maxX;
    let feetRight = group.minX;

    for (let y = feetTop; y <= group.maxY; y += 1) {
      for (let x = group.minX; x <= group.maxX; x += 1) {
        if (group.ids.has(labelMap[y * width + x])) {
          feetLeft = Math.min(feetLeft, x);
          feetRight = Math.max(feetRight, x);
        }
      }
    }

    return {
      x: group.minX,
      y: group.minY,
      width: group.maxX - group.minX + 1,
      height: poseHeight,
      area: group.area,
      feetX: (feetLeft + feetRight) / 2,
      componentIds: group.ids
    };
  });

  return { poses, labelMap };
}

/** Split the image at minimum-density column valleys around expected intervals. */
function splitByValleys(mask: Uint8Array, width: number, height: number, frames: number): Pose[] {
  const colCounts = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      colCounts[x] += mask[y * width + x];
    }
  }

  const cuts = [0];
  const radius = Math.max(4, Math.round((width / frames) * 0.35));

  for (let k = 1; k < frames; k += 1) {
    const center = Math.round((k * width) / frames);
    const startX = Math.max(cuts[k - 1] + 4, center - radius);
    const endX = Math.min(width - 4, center + radius);
    let bestX = center;
    let bestCount = Infinity;

    for (let x = startX; x <= endX; x += 1) {
      const count = colCounts[x];
      if (count < bestCount || (count === bestCount && Math.abs(x - center) < Math.abs(bestX - center))) {
        bestCount = count;
        bestX = x;
      }
    }
    cuts.push(bestX);
  }
  cuts.push(width);

  const poses: Pose[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    const pose = measurePose(mask, width, cuts[frame], cuts[frame + 1], 0, height);
    if (pose) {
      poses.push(pose);
    }
  }

  return poses;
}

/** Runs of "filled" lines, merging runs separated by less than `minGap`. */
function findRuns(counts: number[], minCount: number, minGap: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;

  for (let index = 0; index <= counts.length; index += 1) {
    const filled = index < counts.length && counts[index] >= minCount;

    if (filled && start < 0) {
      start = index;
    } else if (!filled && start >= 0) {
      const previous = runs[runs.length - 1];

      if (previous && start - previous[1] < minGap) {
        previous[1] = index;
      } else {
        runs.push([start, index]);
      }

      start = -1;
    }
  }

  return runs;
}

/** Tight box, pixel count and feet centre of the pose inside a region. */
function measurePose(
  mask: Uint8Array,
  width: number,
  left: number,
  right: number,
  top: number,
  bottom: number
): Pose | null {
  let minX = right;
  let maxX = left - 1;
  let minY = bottom;
  let maxY = top - 1;
  let area = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (mask[y * width + x]) {
        area += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (area === 0) {
    return null;
  }

  const poseHeight = maxY - minY + 1;
  const feetTop = maxY - Math.max(2, Math.round(poseHeight * 0.1));
  let feetLeft = maxX;
  let feetRight = minX;

  for (let y = feetTop; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (mask[y * width + x]) {
        feetLeft = Math.min(feetLeft, x);
        feetRight = Math.max(feetRight, x);
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: poseHeight,
    area,
    feetX: (feetLeft + feetRight) / 2
  };
}
