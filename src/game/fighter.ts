import * as Phaser from 'phaser';

import { getHeroAbilityKit, isAbilitySlotImmune, type HeroAbilityKit } from './abilities';
import { BAYASAA_CHARACTER_ID } from './bayasaa';
import type { AppContext } from './context';
import { FIGHTER_BOUNDS_FIELDS, getAttackProfile, getFighterCombat, getFighterStats } from './fighterConfig';
import {
  findCharacterAnimationKeyByAction,
  getCharacterAnimationDefinition,
  getCharacterDefinition,
  resolveHeroBoundsFrame,
  type CharacterDefinition,
  type HeroAnimationDefinition,
  type HeroBoundsFrame
} from './hero';
import type { FighterPushBox } from './pushbox';
import { spawnChargeAura, spawnSlideDust } from './vfx';
import type {
  AttackKind,
  AttackProfile,
  FighterBoundsVisibility,
  FighterCombat,
  FighterStats,
  Rect
} from './types';

/** Deceleration applied to knockback velocity, in px/s^2. */
const KNOCKBACK_FRICTION = 720;
/** Blockstun duration when an attack is guarded, in seconds. */
const BLOCKSTUN_SECONDS = 0.14;

/** Full meter value; a special requires (and consumes) a full bar. */
const METER_MAX = 100;
/** Meter gained by the attacker when a normal attack lands. */
const METER_GAIN_ON_HIT = 12;
/** Meter gained by the defender when taking a hit. */
const METER_GAIN_ON_TAKE = 7;
/** Meter gained by both sides on a blocked hit. */
const METER_GAIN_ON_BLOCK = 4;
/**
 * After the charge wind-up completes, the fighter holds the charged pose for this
 * long before the special executes — the "super freeze" that lets the cut-in
 * cinematic land before the move launches.
 */
const SUPER_FREEZE_MS = 360;

/**
 * A live attack from a fighter on its current animation frame: the world-space
 * attack rectangle, the resolved damage/knockback/hitstun profile, and a
 * per-swing signature so a single swing only connects once.
 */
export interface ActiveAttack {
  rect: Phaser.Geom.Rectangle;
  profile: AttackProfile;
  signature: number;
  /** True when this is the final hit window of a special (the combo finisher). */
  finisher: boolean;
  /** True when this hit comes from the meter-consuming Super Art. */
  isSuper: boolean;
}

const BOUNDS_ALPHA_ACTIVE = 0.95;
const BOUNDS_ALPHA_INACTIVE = 0.28;

// Frame pixels between the anchor baseline (frame bottom, ~255) and the visible
// feet. Used to seat the ground shadow under the feet rather than the padded
// frame bottom, so fighters don't appear to float above their shadow.
const SHADOW_FOOT_OFFSET = 24;

const BOUNDS_COLORS: Record<keyof FighterBoundsVisibility, number> = Object.fromEntries(
  FIGHTER_BOUNDS_FIELDS.map((field) => [field.id, Number.parseInt(field.color.slice(1), 16)])
) as Record<keyof FighterBoundsVisibility, number>;

/**
 * A per-frame snapshot of a fighter's intent. Held inputs (`left`, `right`,
 * `crouch`, `block`) describe the current key state; edge inputs (`jump`,
 * `light`, `heavy`) are true only on the frame the action was triggered.
 */
export interface FighterAbilityState {
  slot: 1 | 2 | 3 | 4;
  name: string;
  notation: string;
  cooldownRemaining: number;
  cooldownTotal: number;
  ready: boolean;
  highlighted: boolean;
  isSuper: boolean;
  meterFrac: number;
}

export interface FighterM1State {
  step: 0 | 1 | 2 | 3 | 4;
  moveName: string;
  airMove: string;
  active: boolean;
}

export interface FighterInput {
  left: boolean;
  right: boolean;
  crouch: boolean;
  block: boolean;
  jump: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  m1?: boolean;
  ability1?: boolean;
  ability2?: boolean;
  ability3?: boolean;
  ability4?: boolean;
}

/** A neutral (no-op) input snapshot. */
export const NEUTRAL_FIGHTER_INPUT: FighterInput = {
  left: false,
  right: false,
  crouch: false,
  block: false,
  jump: false,
  light: false,
  heavy: false,
  special: false,
  m1: false,
  ability1: false,
  ability2: false,
  ability3: false,
  ability4: false
};

interface FighterActionKeys {
  idle: string;
  walkForward: string;
  walkBackward: string;
  crouch: string;
  jump: string;
  blockHigh: string;
  blockLow: string;
  hitHigh: string;
  lightPunch: string;
  lightKick: string | null;
  crouchMedium: string | null;
  heavy: string;
  jumpHeavy: string | null;
  specialCleave: string;
  specialFollowup: string;
  specialArrow: string;
  specialCharge: string;
  special: string;
  knockdown: string;
}

/**
 * Construction options for a {@link Fighter}: which scene/character to build,
 * where it stands, which way it faces, and its horizontal movement bounds.
 */
export interface FighterOptions {
  scene: Phaser.Scene;
  app: AppContext;
  characterId: string;
  x: number;
  groundY: number;
  facing: 1 | -1;
  minX: number;
  maxX: number;
  depth?: number;
  /**
   * Invoked the moment a meter special begins (the charge wind-up). Hosts use it
   * to trigger the super cut-in cinematic.
   */
  onSpecialStart?: (fighter: Fighter) => void;
  /** Invoked when the meter special transitions into its execution animation. */
  onSuperExecute?: (fighter: Fighter) => void;
  /** Invoked when a ranged special spawns a projectile. */
  onProjectile?: (fighter: Fighter, projectileName: string) => void;
  /** Invoked when an attack enters its active frames so host scenes can spawn slash VFX. */
  onAttackVfx?: (
    fighter: Fighter,
    action: string,
    abilitySlot: 0 | 1 | 2 | 3 | 4,
    m1Step: 0 | 1 | 2 | 3 | 4
  ) => void;
  /** Invoked when a named combo / special move executes (for optional callout text). */
  onMoveCallout?: (fighter: Fighter, moveName: string) => void;
}

/**
 * A self-contained, input-driven fighter actor: sprite + ground shadow + a
 * grounded/airborne state machine. The host scene feeds it a {@link FighterInput}
 * each frame, so the same entity backs both human and CPU opponents. Movement
 * and physics stats are read from the persisted fighter balance.
 */
export class Fighter {
  private readonly scene: Phaser.Scene;
  private readonly app: AppContext;
  private readonly character: CharacterDefinition;
  private readonly kit: HeroAbilityKit;
  private readonly actionKeys: FighterActionKeys;
  private facing: 1 | -1;
  private minX: number;
  private maxX: number;
  private readonly groundY: number;

  private sprite!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private boundsGraphics!: Phaser.GameObjects.Graphics;
  private depthBase = 5;
  private posX: number;
  private velocityY = 0;
  private grounded = true;
  private locked = false;
  private frozen = true;
  private currentAnimKey = '';
  private currentReverse = false;

  private maxHealth: number;
  private health: number;
  private hitstunTimer = 0;
  private stunIsBlock = false;
  private stunBlockLow = false;
  private knockbackVel = 0;
  private defeated = false;
  private attackId = 0;
  private attackConnected = true;
  // Multi-hit: each contiguous run of attack-active frames is one hit window.
  // When the attack box turns on after being off, a new window opens so the
  // swing can connect again — this is how a special lands several hits.
  private attackActiveLast = false;
  private meter = 0;
  private appliedScale = 0;
  private attackElapsed = 0;
  private attackLungeVel = 0;
  private activeAbilitySlot: 0 | 1 | 2 | 3 | 4 = 0;
  private m1ComboStep: 0 | 1 | 2 | 3 | 4 = 0;
  private sliding = false;
  private slideDustTimer = 0;
  private projectileFiredForSwing = false;
  private abilityCooldowns = { cleave: 0, followup: 0, arrow: 0 };
  private motionBuffer: Array<{ dir: number; time: number }> = [];
  private lastMotionDir = 5;
  private motionClock = 0;
  private idleClock = 0;
  private immuneTintApplied = false;
  private readonly hasSpecial: boolean;
  private readonly onSpecialStart?: (fighter: Fighter) => void;
  private readonly onSuperExecute?: (fighter: Fighter) => void;
  private readonly onProjectile?: (fighter: Fighter, projectileName: string) => void;
  private readonly onAttackVfx?: (
    fighter: Fighter,
    action: string,
    abilitySlot: 0 | 1 | 2 | 3 | 4,
    m1Step: 0 | 1 | 2 | 3 | 4
  ) => void;
  private readonly onMoveCallout?: (fighter: Fighter, moveName: string) => void;

  constructor(options: FighterOptions) {
    this.scene = options.scene;
    this.app = options.app;
    this.onSpecialStart = options.onSpecialStart;
    this.onSuperExecute = options.onSuperExecute;
    this.onProjectile = options.onProjectile;
    this.onAttackVfx = options.onAttackVfx;
    this.onMoveCallout = options.onMoveCallout;
    this.character = getCharacterDefinition(options.characterId);
    this.kit = getHeroAbilityKit(this.character.id);
    this.facing = options.facing;
    this.minX = options.minX;
    this.maxX = options.maxX;
    this.groundY = options.groundY;
    this.posX = Phaser.Math.Clamp(options.x, options.minX, options.maxX);
    this.actionKeys = this.resolveActionKeys();
    this.hasSpecial = findCharacterAnimationKeyByAction(this.character.id, 'special') !== null;
    this.maxHealth = this.combat().maxHealth;
    this.health = this.maxHealth;
    this.build(options.depth ?? 5);
  }

  /** The fighter's id. */
  get characterId(): string {
    return this.character.id;
  }

  /** The fighter's display label. */
  get label(): string {
    return this.character.label;
  }

  /** The fighter's current horizontal centre in world pixels. */
  get x(): number {
    return this.posX;
  }

  /** The fighter's current vertical position (feet y) in world pixels. */
  get y(): number {
    return this.sprite.y;
  }

  /** Current display height in world pixels. */
  get displayHeight(): number {
    return this.sprite.displayHeight;
  }

  /** The direction the fighter is facing (+1 right, -1 left). */
  get facingDirection(): 1 | -1 {
    return this.facing;
  }

  /** The fighter's current health. */
  get health01(): number {
    return this.maxHealth > 0 ? Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) : 0;
  }

  /** Whether the fighter has been knocked out this round. */
  get isDefeated(): boolean {
    return this.defeated;
  }

  /** The fighter's special meter charge (0..1). */
  get meter01(): number {
    return METER_MAX > 0 ? Phaser.Math.Clamp(this.meter / METER_MAX, 0, 1) : 0;
  }

  /** Whether the special meter is full and a special can be performed. */
  get isMeterReady(): boolean {
    return this.hasSpecial && this.meter >= METER_MAX;
  }

  /** Whether the fighter is currently in unblocked hitstun (used for combo counters). */
  get inHitstun(): boolean {
    return this.hitstunTimer > 0 && !this.stunIsBlock && !this.defeated;
  }

  /** Whether the fighter is standing on the ground. */
  get isGrounded(): boolean {
    return this.grounded;
  }

  /** Whether the fighter is currently sliding low along the ground. */
  get isSliding(): boolean {
    return this.sliding;
  }

  /** Whether the fighter is currently immune while performing a main ability. */
  get isImmune(): boolean {
    return !this.defeated && this.locked && isAbilitySlotImmune(this.activeAbilitySlot);
  }

  /** Returns live ability slot states for the on-screen Abilities Bar HUD. */
  getAbilityStates(): FighterAbilityState[] {
    const inSlot1 = this.locked && this.activeAbilitySlot === 1;

    return [
      {
        slot: 1,
        name: this.kit.ability1.name,
        notation: this.kit.ability1.notation,
        cooldownRemaining: this.abilityCooldowns.cleave,
        cooldownTotal: this.kit.ability1.cooldown,
        ready: this.abilityCooldowns.cleave <= 0,
        highlighted: false,
        isSuper: false,
        meterFrac: 1
      },
      {
        slot: 2,
        name: this.kit.ability2.name,
        notation: this.kit.ability2.notation,
        cooldownRemaining: inSlot1 ? 0 : this.abilityCooldowns.followup,
        cooldownTotal: this.kit.ability2.cooldown,
        ready: inSlot1 || this.abilityCooldowns.followup <= 0,
        highlighted: inSlot1,
        isSuper: false,
        meterFrac: 1
      },
      {
        slot: 3,
        name: this.kit.ability3.name,
        notation: this.kit.ability3.notation,
        cooldownRemaining: this.abilityCooldowns.arrow,
        cooldownTotal: this.kit.ability3.cooldown,
        ready: this.abilityCooldowns.arrow <= 0,
        highlighted: false,
        isSuper: false,
        meterFrac: 1
      },
      {
        slot: 4,
        name: this.kit.ability4.name,
        notation: this.kit.ability4.notation,
        cooldownRemaining: 0,
        cooldownTotal: 0,
        ready: this.isMeterReady,
        highlighted: this.isMeterReady,
        isSuper: true,
        meterFrac: this.meter01
      }
    ];
  }

  /** Returns live M1 4-hit basic combo state for HUD display. */
  getM1State(): FighterM1State {
    const active = this.locked && this.activeAbilitySlot === 0 && this.m1ComboStep > 0;
    const step = active ? this.m1ComboStep : 0;
    const moveIndex = step > 0 ? step - 1 : 0;
    return {
      step,
      moveName: this.kit.m1.moves[moveIndex] ?? this.kit.m1.moves[0],
      airMove: this.kit.m1.airMove,
      active
    };
  }

  /**
   * Adds charge to the special meter (clamped to full). Called by the match when
   * this fighter deals, blocks, or takes a hit.
   * @param amount - Meter points to add.
   */
  gainMeter(amount: number): void {
    if (this.defeated) {
      return;
    }

    const mult = this.character.id === BAYASAA_CHARACTER_ID ? 2.2 : 1;
    this.meter = Phaser.Math.Clamp(this.meter + amount * mult, 0, METER_MAX);
  }

  /**
   * Awards meter for landing an attack. Special moves grant no meter (so they
   * can't refill themselves); normal hits grant more than guarded ones.
   * @param blocked - Whether the attack was guarded by the defender.
   * @param isSpecial - Whether the attack was a special move.
   */
  registerOffense(blocked: boolean, isSpecial: boolean): void {
    if (isSpecial) {
      return;
    }

    this.gainMeter(blocked ? METER_GAIN_ON_BLOCK : METER_GAIN_ON_HIT);
  }

  /**
   * Awards meter for being struck. Taking a clean hit builds more than blocking.
   * @param blocked - Whether the incoming attack was guarded.
   */
  registerDefense(blocked: boolean): void {
    this.gainMeter(blocked ? METER_GAIN_ON_BLOCK : METER_GAIN_ON_TAKE);
  }

  /** Tops the special meter to full (used by the playground's debug fill toggle). */
  fillMeter(): void {
    this.meter = METER_MAX;
  }

  /**
   * Gradually restores health toward full without clearing hitstun/knockback,
   * so a training dummy visibly takes damage and then recovers between hits.
   * @param amount - Health points to restore this tick.
   */
  regenHealth(amount: number): void {
    if (!this.defeated) {
      this.health = Math.min(this.maxHealth, this.health + amount);
    }
  }

  /**
   * Live-updates the display scale (sprite + ground shadow) so playground scale
   * tuning is reflected without rebuilding the fighter.
   * @param scale - The desired display scale.
   */
  setVisualScale(scale: number): void {
    if (this.appliedScale === scale) {
      return;
    }

    this.appliedScale = scale;
    this.sprite.setScale(scale);
    this.shadow.setSize(Math.round(107 * scale), Math.round(24 * scale));
    this.shadow.y = this.groundY - SHADOW_FOOT_OFFSET * scale;
    this.updateShadow();
  }

  /**
   * Sets the base render depth, restacking the sprite, shadow, and bounds
   * overlay together. Used to bring the most recently active fighter in front.
   * @param base - The base depth for the sprite.
   */
  setDepthBase(base: number): void {
    if (this.depthBase === base) {
      return;
    }

    this.depthBase = base;
    this.applyDepths();
  }

  /**
   * Turns the fighter to face a target x (e.g. the opponent), flipping the
   * sprite and — via the shared transform — its bounds. Skipped while mid
   * one-shot action and within a small deadzone to avoid jitter on overlap.
   * @param targetX - The world x the fighter should face toward.
   */
  faceToward(targetX: number): void {
    if (this.locked) {
      return;
    }

    const delta = targetX - this.posX;
    if (Math.abs(delta) < 12) {
      return;
    }

    const desired: 1 | -1 = delta >= 0 ? 1 : -1;
    if (desired !== this.facing) {
      this.facing = desired;
      this.sprite.setFlipX(this.facing === 1);
    }
  }

  /**
   * Freezes or unfreezes the fighter. While frozen it holds the idle pose and
   * ignores all input (used during the round intro).
   * @param frozen - Whether the fighter should be frozen.
   */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /**
   * Updates the fighter's horizontal movement limits and immediately re-clamps
   * the current position into the new range. Used by the match camera to turn
   * the visible screen edges into walls (and the stage ends into corners).
   * @param minX - The leftmost centre the fighter may occupy, in world pixels.
   * @param maxX - The rightmost centre the fighter may occupy, in world pixels.
   */
  setHorizontalBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = Math.max(minX, maxX);
    this.posX = Phaser.Math.Clamp(this.posX, this.minX, this.maxX);
    this.sprite.x = this.posX;
    this.shadow.x = this.posX;
  }

  /**
   * Returns this fighter's solid body pushbox in world coordinates.
   * Grounded crouching/sliding fighters have a much shorter pushbox so they can
   * slide underneath a jumping opponent, while jumping fighters clear a
   * standing opponent once their feet rise above torso height.
   */
  getPushBox(): FighterPushBox {
    const animation = this.currentAnimation();
    const frame = animation ? this.resolvedFrame(animation) : null;
    const rawWidth =
      animation && frame?.collision ? this.frameRectToWorld(animation, frame.collision).width : 76;
    const width = Phaser.Math.Clamp(rawWidth, 64, 96);
    const isLow =
      this.grounded &&
      (this.sliding ||
        this.currentAnimKey === this.actionKeys.crouch ||
        this.currentAnimKey === this.actionKeys.blockLow ||
        this.currentAnimKey === this.actionKeys.crouchMedium);
    const height = isLow ? 64 : 118;

    return {
      x: this.posX,
      width,
      top: this.sprite.y - height,
      bottom: this.sprite.y,
      minX: this.minX,
      maxX: this.maxX
    };
  }

  /** Applies a pushbox-resolved horizontal position within current arena bounds. */
  setResolvedX(x: number): void {
    const clamped = Phaser.Math.Clamp(x, this.minX, this.maxX);
    if (clamped === this.posX) {
      return;
    }

    this.posX = clamped;
    this.sprite.x = clamped;
    this.shadow.x = clamped;
    this.drawBoundsOverlay();
  }

  /**
   * The fighter's currently active attack (if any): present only while a strike
   * animation is on an attack-active frame and the swing hasn't connected yet.
   */
  getActiveAttack(): ActiveAttack | null {
    if (this.attackConnected || this.defeated) {
      return null;
    }

    const kind = this.currentAttackKind();
    if (kind === null) {
      return null;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);
    if (!frame?.attack) {
      return null;
    }

    const frameIndex = this.currentFrameIndex(animation);
    const isSuper = this.activeAbilitySlot === 4;
    const isM1Strike = this.activeAbilitySlot === 0 && this.m1ComboStep > 0;
    const isM1Finisher = isM1Strike && this.m1ComboStep === 4;
    const isFinisherMove = isSuper || this.activeAbilitySlot === 2 || isM1Finisher;
    const finisher = isFinisherMove && !this.hasAttackFrameAfter(animation, frameIndex);
    const baseProfile = getAttackProfile(this.combat(), kind);
    const m1DamageBonus = isM1Strike
      ? this.m1ComboStep === 4
        ? this.kit.m1.finisherDamageBonus
        : this.kit.m1.stepDamageBonus[this.m1ComboStep - 1] ?? 0
      : 0;
    const profile = isM1Strike
      ? {
          ...baseProfile,
          damage: baseProfile.damage + m1DamageBonus,
          knockback: isM1Finisher
            ? Math.round(baseProfile.knockback * this.kit.m1.finisherKnockbackMul)
            : baseProfile.knockback
        }
      : baseProfile;

    return {
      rect: this.frameRectToWorld(animation, frame.attack),
      profile,
      signature: this.attackId,
      finisher,
      isSuper
    };
  }

  /** Marks the current swing as having connected so it can't hit again. */
  markAttackConnected(): void {
    this.attackConnected = true;
  }

  /**
   * Briefly tints the sprite to telegraph an impact (red for a clean hit, blue
   * for a guarded one).
   * @param blocked - Whether the hit was blocked.
   */
  flashHit(blocked: boolean): void {
    this.sprite.setTint(blocked ? 0x93c5fd : 0xff7a7a);
    this.scene.time.delayedCall(100, () => this.sprite?.clearTint());
  }

  /**
   * The fighter's current hurtbox in world space (the active frame's hit box,
   * falling back to its visual box), or null when unavailable.
   */
  getHurtRect(): Phaser.Geom.Rectangle | null {
    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);
    const rect = frame?.hit ?? frame?.visual;

    return rect ? this.frameRectToWorld(animation, rect) : null;
  }

  /**
   * The fighter's active guard box in world space — the current frame's `guard`
   * rect, present only while a block pose is held (and the fighter isn't
   * defeated). An attack is blocked when its hitbox overlaps this rect; null
   * means the fighter isn't guarding and any connecting attack will hit.
   */
  getGuardRect(): Phaser.Geom.Rectangle | null {
    if (this.defeated) {
      return null;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);

    return frame?.guard ? this.frameRectToWorld(animation, frame.guard) : null;
  }

  /**
   * Applies a connected hit: blocked hits deal no damage and apply short
   * blockstun + light pushback; unblocked hits deal damage, hitstun, and
   * knockback, triggering a knockdown when health reaches zero.
   * @param profile - The attack profile that landed.
   * @param attackerFacing - The attacker's facing (push direction).
   * @param blocked - Whether the defender guarded the attack.
   */
  applyHit(profile: AttackProfile, attackerFacing: 1 | -1, blocked: boolean): void {
    if (this.defeated || this.isImmune) {
      return;
    }

    if (blocked) {
      this.knockbackVel = attackerFacing * profile.knockback * 0.35;
      this.hitstunTimer = Math.max(this.hitstunTimer, BLOCKSTUN_SECONDS);
      this.stunIsBlock = true;
      this.stunBlockLow = this.currentAnimKey === this.actionKeys.blockLow;
      this.locked = false;
      return;
    }

    const isBayasaa = this.character.id === BAYASAA_CHARACTER_ID;
    const damageTaken = isBayasaa ? Math.max(1, Math.round(profile.damage * 0.65)) : profile.damage;
    const knockbackMul = isBayasaa ? 0.6 : 1;
    const hitstunMul = isBayasaa ? 0.6 : 1;

    this.health = Math.max(0, this.health - damageTaken);
    this.knockbackVel = attackerFacing * profile.knockback * knockbackMul;

    if (this.health <= 0) {
      this.defeated = true;
      this.locked = true;
      this.activeAbilitySlot = 0;
      this.m1ComboStep = 0;
      this.sliding = false;
      this.grounded = true;
      this.stunIsBlock = false;
      this.hitstunTimer = 0;
      this.playState(this.actionKeys.knockdown, false);
      return;
    }

    this.stunIsBlock = false;
    this.locked = false;
    this.activeAbilitySlot = 0;
    this.m1ComboStep = 0;
    this.sliding = false;
    this.hitstunTimer = (profile.hitstun * hitstunMul) / 1000;
    this.currentAnimKey = '';
    this.playState(this.actionKeys.hitHigh, false);
  }

  /**
   * Resets the fighter for a new round: restores health, repositions and faces,
   * clears combat state, and re-freezes until the round intro releases it.
   * @param x - The spawn x position.
   * @param facing - The spawn facing direction.
   */
  resetForRound(x: number, facing: 1 | -1): void {
    this.posX = Phaser.Math.Clamp(x, this.minX, this.maxX);
    this.facing = facing;
    this.maxHealth = this.combat().maxHealth;
    this.health = this.maxHealth;
    this.velocityY = 0;
    this.grounded = true;
    this.locked = false;
    this.activeAbilitySlot = 0;
    this.m1ComboStep = 0;
    this.sliding = false;
    this.slideDustTimer = 0;
    this.defeated = false;
    this.frozen = true;
    this.hitstunTimer = 0;
    this.stunIsBlock = false;
    this.stunBlockLow = false;
    this.knockbackVel = 0;
    this.attackLungeVel = 0;
    this.attackElapsed = 0;
    this.attackConnected = true;
    this.attackActiveLast = false;
    this.projectileFiredForSwing = false;
    this.abilityCooldowns = { cleave: 0, followup: 0, arrow: 0 };
    this.motionBuffer = [];
    this.lastMotionDir = 5;
    this.meter = 0;
    this.currentAnimKey = '';
    this.currentReverse = false;
    this.idleClock = 0;
    this.immuneTintApplied = false;

    this.sprite.clearTint();
    this.sprite.setPosition(this.posX, this.groundY).setFlipX(this.facing === 1);
    this.sprite.setScale(this.appliedScale || this.stats().scale);
    this.playState(this.actionKeys.idle, true);
    this.updateShadow();
  }

  /**
   * Advances the fighter one frame.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  update(seconds: number, input: FighterInput): void {
    if (this.defeated) {
      this.sliding = false;
      this.updateIdleAnimation(seconds, false);
      this.updateImmunityVisual();
      this.playState(this.actionKeys.knockdown, false);
      this.applyKnockback(seconds);
      this.updateShadow();
      this.drawBoundsOverlay();
      return;
    }

    if (this.frozen) {
      this.sliding = false;
      this.updateImmunityVisual();
      this.playState(this.actionKeys.idle, true);
      this.updateIdleAnimation(seconds, true);
      this.drawBoundsOverlay();
      return;
    }

    this.abilityCooldowns.cleave = Math.max(0, this.abilityCooldowns.cleave - seconds);
    this.abilityCooldowns.followup = Math.max(0, this.abilityCooldowns.followup - seconds);
    this.abilityCooldowns.arrow = Math.max(0, this.abilityCooldowns.arrow - seconds);

    if (this.hitstunTimer > 0) {
      this.sliding = false;
      this.updateIdleAnimation(seconds, false);
      this.updateImmunityVisual();
      this.hitstunTimer = Math.max(0, this.hitstunTimer - seconds);
      this.applyKnockback(seconds);
      this.playState(
        this.stunIsBlock
          ? this.stunBlockLow
            ? this.actionKeys.blockLow
            : this.actionKeys.blockHigh
          : this.actionKeys.hitHigh,
        false
      );
      this.updateShadow();

      if (this.hitstunTimer === 0) {
        this.currentAnimKey = '';
      }

      this.drawBoundsOverlay();
      return;
    }

    if (this.character.id === BAYASAA_CHARACTER_ID) {
      this.regenHealth(3.5 * seconds);
    }

    this.recordMotion(seconds, input);

    if (!this.grounded) {
      this.sliding = false;
      this.updateAirborne(seconds, input);
    } else if (this.locked) {
      this.sliding = false;
      this.attackElapsed += seconds;
      this.applyAttackLunge(seconds);
      this.checkArrowProjectileSpawn();
      this.tryCancelCombo(input);
    } else {
      this.updateGrounded(seconds, input);
    }

    const isIdle = this.grounded && !this.locked && !this.sliding && this.currentAnimKey === this.actionKeys.idle;
    this.updateIdleAnimation(seconds, isIdle);
    this.updateImmunityVisual();
    this.updateAttackWindow();
    this.drawBoundsOverlay();
  }

  /** Destroys the fighter's display objects. */
  destroy(): void {
    this.sprite?.removeAllListeners();
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.boundsGraphics?.destroy();
  }

  /**
   * Resolves the per-action animation keys for this character, falling back to
   * the first available animation for any missing action.
   */
  private resolveActionKeys(): FighterActionKeys {
    const key = (action: string): string =>
      findCharacterAnimationKeyByAction(this.character.id, action) ?? this.character.animations[0].key;
    const heavyKey =
      findCharacterAnimationKeyByAction(this.character.id, 'heavy-kick') ??
      findCharacterAnimationKeyByAction(this.character.id, 'heavy-punch') ??
      key('light-punch');

    return {
      idle: key('idle'),
      walkForward: key('walk-forward'),
      walkBackward: key('walk-backward'),
      crouch: key('crouch'),
      jump: key('jump'),
      blockHigh: key('block-high'),
      blockLow: findCharacterAnimationKeyByAction(this.character.id, 'block-low') ?? key('block-high'),
      hitHigh: key('hit-high'),
      lightPunch: key('light-punch'),
      lightKick: findCharacterAnimationKeyByAction(this.character.id, 'light-kick'),
      crouchMedium: findCharacterAnimationKeyByAction(this.character.id, 'crouch-medium-punch'),
      heavy: heavyKey,
      jumpHeavy: findCharacterAnimationKeyByAction(this.character.id, 'jump-heavy-punch'),
      specialCleave: findCharacterAnimationKeyByAction(this.character.id, 'special-cleave') ?? heavyKey,
      specialFollowup: findCharacterAnimationKeyByAction(this.character.id, 'special-followup') ?? heavyKey,
      specialArrow:
        findCharacterAnimationKeyByAction(this.character.id, 'special-arrow') ??
        findCharacterAnimationKeyByAction(this.character.id, 'special-charge') ??
        key('light-punch'),
      specialCharge: findCharacterAnimationKeyByAction(this.character.id, 'special-charge') ?? key('crouch'),
      special: findCharacterAnimationKeyByAction(this.character.id, 'special') ?? heavyKey,
      knockdown: key('knockdown')
    };
  }

  /** Current persisted stats for this fighter. */
  private stats(): FighterStats {
    return getFighterStats(this.app.debugStore.getState().fighterPlayground, this.character.id);
  }

  /** Current persisted combat tuning for this fighter. */
  private combat(): FighterCombat {
    return getFighterCombat(this.app.debugStore.getState().fighterPlayground, this.character.id);
  }

  /**
   * The attack kind currently being thrown (`high` = light, `low` = heavy), or
   * null when the fighter isn't mid-strike.
   */
  private currentAttackKind(): AttackKind | null {
    if (!this.locked) {
      return null;
    }
    if (this.activeAbilitySlot === 1 || this.activeAbilitySlot === 2 || this.activeAbilitySlot === 4) {
      return 'special';
    }
    if (this.activeAbilitySlot === 3) {
      return null;
    }
    if (this.m1ComboStep === 3 || this.m1ComboStep === 4) {
      return 'low';
    }
    if (
      this.currentAnimKey === this.actionKeys.lightPunch ||
      this.currentAnimKey === this.actionKeys.lightKick ||
      this.currentAnimKey === this.actionKeys.crouchMedium
    ) {
      return 'high';
    }
    if (this.currentAnimKey === this.actionKeys.heavy || this.currentAnimKey === this.actionKeys.jumpHeavy) {
      return 'low';
    }

    return null;
  }

  /** The fighter's active animation definition, or null when none is playing. */
  private currentAnimation(): HeroAnimationDefinition | null {
    const animKey = this.sprite.anims.currentAnim?.key ?? this.currentAnimKey;
    if (!animKey) {
      return null;
    }

    return getCharacterAnimationDefinition(this.character.id, animKey);
  }

  /**
   * Advances knockback: slides the fighter by the current knockback velocity and
   * decays it toward zero by friction.
   * @param seconds - Delta time in seconds.
   */
  private applyKnockback(seconds: number): void {
    if (this.knockbackVel === 0) {
      return;
    }

    this.posX = Phaser.Math.Clamp(this.posX + this.knockbackVel * seconds, this.minX, this.maxX);
    this.sprite.x = this.posX;

    const decay = KNOCKBACK_FRICTION * seconds;
    this.knockbackVel =
      this.knockbackVel > 0
        ? Math.max(0, this.knockbackVel - decay)
        : Math.min(0, this.knockbackVel + decay);
  }

  /**
   * Builds the sprite (feet-anchored, facing the opponent) and ground shadow.
   * @param depth - The display depth for the sprite (shadow renders just under).
   */
  private build(depth: number): void {
    const scale = this.stats().scale;
    this.appliedScale = scale;
    this.depthBase = depth;

    this.shadow = this.scene.add
      .ellipse(
        this.posX,
        this.groundY - SHADOW_FOOT_OFFSET * scale,
        Math.round(107 * scale),
        Math.round(24 * scale),
        0x000000,
        1
      )
      .setAlpha(0.32)
      .setDepth(depth - 1);

    this.sprite = this.scene.add
      .sprite(this.posX, this.groundY, this.actionKeys.idle, 0)
      .setOrigin(0.5, this.character.anchor.y)
      .setScale(scale)
      .setFlipX(this.facing === 1)
      .setDepth(depth);

    this.boundsGraphics = this.scene.add.graphics().setDepth(depth + 45);

    this.playState(this.actionKeys.idle, true);
  }

  /** Restacks the sprite, shadow, and bounds overlay around the base depth. */
  private applyDepths(): void {
    this.shadow.setDepth(this.depthBase - 1);
    this.sprite.setDepth(this.depthBase);
    this.boundsGraphics.setDepth(this.depthBase + 45);
  }

  /**
   * Advances the jump arc, allows light air drift, and lands on the ground axis.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  private updateAirborne(seconds: number, input: FighterInput): void {
    const airStrikeKey = this.actionKeys.jumpHeavy ?? this.actionKeys.heavy ?? this.actionKeys.lightPunch;
    if (!this.locked && (input.m1 || input.heavy || input.light)) {
      this.startAirAttack(airStrikeKey, Boolean(input.m1 || input.light));
    }

    const stats = this.stats();
    this.velocityY += stats.gravity * seconds;
    let nextY = this.sprite.y + this.velocityY * seconds;

    const drift = this.horizontalDirection(input);
    if (drift !== 0) {
      this.posX = Phaser.Math.Clamp(this.posX + drift * stats.airDrift * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
    }

    if (nextY >= this.groundY) {
      nextY = this.groundY;
      this.velocityY = 0;
      this.grounded = true;
      this.locked = false;
      this.m1ComboStep = 0;
      this.attackConnected = true;
      this.currentAnimKey = '';
      this.currentReverse = false;
    }

    this.sprite.y = nextY;
    this.updateShadow();
  }

  /**
   * Resolves grounded behaviour: one-shot actions first, then held block/crouch,
   * then walking, then idle.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  private updateGrounded(seconds: number, input: FighterInput): void {
    const dir = this.horizontalDirection(input);
    const holdingForward = dir === this.facing;
    const holdingBack = dir === -this.facing;
    const anyAttack = input.light || input.heavy || input.special || Boolean(input.m1);

    // Super Art: 236236+Attack, ability4, or Special button with full meter (unless explicitly throwing 214P).
    if (
      this.isMeterReady &&
      (input.ability4 ||
        (input.special && !holdingBack && !this.hasMotion('214', 420)) ||
        (this.hasMotion('236236', 680) && (input.heavy || input.special)))
    ) {
      this.startSpecial();
      return;
    }

    // Special Move: Ranged Projectile (214P, Back+Special, or ability3).
    if (
      this.abilityCooldowns.arrow <= 0 &&
      (input.ability3 || (this.hasMotion('214', 420) && anyAttack) || (holdingBack && input.special))
    ) {
      this.startArrowLaunch();
      return;
    }

    // Special Move: Ability 2 standalone.
    if (this.abilityCooldowns.followup <= 0 && input.ability2) {
      this.startFollowupSlash(false);
      return;
    }

    // Special Move: Ability 1 (236S, ability1, or Special when meter isn't ready).
    if (
      this.abilityCooldowns.cleave <= 0 &&
      (input.ability1 || (this.hasMotion('236', 420) && anyAttack) || (input.special && !this.isMeterReady))
    ) {
      this.startCleave();
      return;
    }

    if (input.special && this.isMeterReady) {
      this.sliding = false;
      this.startSpecial();
      return;
    }
    if (input.jump) {
      this.sliding = false;
      this.startJump();
      return;
    }
    if (input.crouch && this.actionKeys.crouchMedium && (input.light || input.heavy || input.m1)) {
      this.startOneShot(this.actionKeys.crouchMedium, 40, 'CROUCH STRIKE', 0, input.m1 ? 1 : 0);
      return;
    }
    if (input.m1 || input.light) {
      this.startM1Step(1);
      return;
    }
    if (input.heavy) {
      this.startOneShot(this.actionKeys.heavy, holdingForward ? 210 : 60);
      return;
    }
    if (input.block) {
      this.sliding = false;
      this.playState(input.crouch ? this.actionKeys.blockLow : this.actionKeys.blockHigh, false);
      return;
    }
    if (input.crouch && dir !== 0) {
      const stats = this.stats();
      const slideSpeed = stats.walkSpeed * 1.58;
      if (!this.sliding) {
        this.slideDustTimer = 0;
      }
      this.sliding = true;
      this.posX = Phaser.Math.Clamp(this.posX + dir * slideSpeed * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
      this.updateShadow();
      this.playState(this.actionKeys.crouch, false);
      this.slideDustTimer -= seconds;
      if (this.slideDustTimer <= 0) {
        this.slideDustTimer = 0.065;
        spawnSlideDust(this.scene, this.posX, this.groundY, dir, this.kit.themeColor);
      }
      return;
    }

    this.sliding = false;

    if (input.crouch) {
      this.playState(this.actionKeys.crouch, false);
      return;
    }

    if (dir !== 0) {
      const stats = this.stats();
      this.posX = Phaser.Math.Clamp(this.posX + dir * stats.walkSpeed * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
      this.updateShadow();
      this.playWalk(dir === this.facing);
      return;
    }

    this.playState(this.actionKeys.idle, true);
  }

  /**
   * Returns -1 for left, +1 for right, or 0 when neutral/opposed.
   * @param input - The intent snapshot for this frame.
   */
  private horizontalDirection(input: FighterInput): number {
    return (input.right ? 1 : 0) - (input.left ? 1 : 0);
  }

  /**
   * Plays a looping or hold animation, switching only when the state (key or
   * playback direction) changes.
   * @param animKey - The animation key to play.
   * @param loop - Whether the animation should loop.
   * @param reverse - Whether to play the animation in reverse.
   */
  private playState(animKey: string, loop: boolean, reverse = false): void {
    if (this.currentAnimKey === animKey && this.currentReverse === reverse) {
      return;
    }

    this.currentAnimKey = animKey;
    this.currentReverse = reverse;

    // ignoreIfPlaying must be false so a forward->reverse switch on the same
    // key (reverse walk) is applied; the guard above prevents per-frame restarts.
    const config: Phaser.Types.Animations.PlayAnimationConfig = { key: animKey, repeat: loop ? -1 : 0 };
    if (reverse) {
      this.sprite.playReverse(config, false);
    } else {
      this.sprite.play(config, false);
    }
  }

  /**
   * Plays the appropriate walk animation. Backward walking uses the dedicated
   * backward animation, or the forward animation played in reverse when the
   * persisted "use reverse walk anims" setting is enabled.
   * @param movingForward - Whether the fighter is walking in its facing direction.
   */
  private playWalk(movingForward: boolean): void {
    if (movingForward) {
      this.playState(this.actionKeys.walkForward, true);
      return;
    }

    const reverseWalk = this.app.debugStore.getState().fighterPlayground.reverseWalk;
    if (reverseWalk) {
      this.playState(this.actionKeys.walkForward, true, true);
      return;
    }

    this.playState(this.actionKeys.walkBackward, true);
  }

  /**
   * Plays a one-shot action that locks input until it completes, then returns
   * to idle.
   * @param animKey - The action animation key to play.
   */
  private startOneShot(
    animKey: string,
    forwardLunge = 0,
    callout?: string,
    abilitySlot: 0 | 1 | 2 | 3 = 0,
    m1Step: 0 | 1 | 2 | 3 | 4 = 0
  ): void {
    this.locked = true;
    this.activeAbilitySlot = abilitySlot;
    this.m1ComboStep = m1Step;
    this.currentAnimKey = animKey;
    this.currentReverse = false;
    this.attackId += 1;
    const swingId = this.attackId;
    this.attackElapsed = 0;
    this.attackLungeVel = forwardLunge * this.facing;
    this.attackConnected = false;
    this.attackActiveLast = false;
    this.projectileFiredForSwing = false;

    if (callout) {
      this.onMoveCallout?.(this, callout);
    }

    this.sprite.play({ key: animKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${animKey}`, () => {
      if (this.attackId !== swingId) {
        return;
      }

      this.locked = false;
      this.activeAbilitySlot = 0;
      this.m1ComboStep = 0;
      this.attackLungeVel = 0;
      this.currentAnimKey = '';

      if (this.grounded) {
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  private startM1Step(step: 1 | 2 | 3 | 4): void {
    const m1 = this.kit.m1;
    const lunge = m1.lunge[step - 1] ?? 75;
    let animKey = this.actionKeys.lightPunch;
    if (step === 2) {
      animKey = this.actionKeys.lightKick ?? this.actionKeys.heavy;
    } else if (step === 3) {
      animKey = this.actionKeys.crouchMedium ?? this.actionKeys.lightPunch;
    } else if (step === 4) {
      animKey = this.actionKeys.heavy;
    }

    const callout = step === 4 ? m1.moves[3] : undefined;
    this.startOneShot(animKey, lunge, callout, 0, step);
  }

  private startAirAttack(animKey: string, isM1 = false): void {
    this.locked = true;
    this.activeAbilitySlot = 0;
    this.m1ComboStep = isM1 ? 1 : 0;
    this.currentAnimKey = animKey;
    this.currentReverse = false;
    this.attackId += 1;
    const swingId = this.attackId;
    this.attackElapsed = 0;
    this.attackLungeVel = 0;
    this.attackConnected = false;
    this.attackActiveLast = false;

    if (isM1) {
      this.onMoveCallout?.(this, this.kit.m1.airMove);
    }

    this.sprite.play({ key: animKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${animKey}`, () => {
      if (this.attackId !== swingId || this.grounded) {
        return;
      }
      this.locked = false;
      this.m1ComboStep = 0;
      this.playState(this.actionKeys.jump, false);
    });
  }

  private startCleave(): void {
    this.abilityCooldowns.cleave = this.kit.ability1.cooldown;
    this.startOneShot(this.actionKeys.specialCleave, this.kit.ability1.lunge, this.kit.ability1.callout, 1);
  }

  private startFollowupSlash(isChain: boolean): void {
    this.abilityCooldowns.followup = this.kit.ability2.cooldown;
    this.startOneShot(
      this.actionKeys.specialFollowup,
      isChain ? this.kit.ability2.lunge : Math.round(this.kit.ability2.lunge * 0.8),
      isChain ? this.kit.ability2.chainCallout : this.kit.ability2.callout,
      2
    );
  }

  private startArrowLaunch(): void {
    this.abilityCooldowns.arrow = this.kit.ability3.cooldown;
    this.startOneShot(this.actionKeys.specialArrow, 0, this.kit.ability3.callout, 3);
  }

  private checkArrowProjectileSpawn(): void {
    if (this.activeAbilitySlot !== 3 || this.projectileFiredForSwing) {
      return;
    }

    const anim = this.currentAnimation();
    if (!anim) {
      return;
    }

    const triggerFrame = Math.min(2, Math.max(0, anim.sheet.frames - 1));
    if (this.currentFrameIndex(anim) >= triggerFrame) {
      this.projectileFiredForSwing = true;
      this.onProjectile?.(this, this.kit.ability3.projectile.name);
    }
  }

  private applyAttackLunge(seconds: number): void {
    if (this.attackLungeVel === 0) {
      return;
    }

    this.posX = Phaser.Math.Clamp(this.posX + this.attackLungeVel * seconds, this.minX, this.maxX);
    this.sprite.x = this.posX;
    this.updateShadow();
    const decay = 780 * seconds;
    this.attackLungeVel =
      this.attackLungeVel > 0
        ? Math.max(0, this.attackLungeVel - decay)
        : Math.min(0, this.attackLungeVel + decay);
  }

  /**
   * Handles combo cancel chains while a fighter is mid-attack:
   * - Light Punch -> Light Kick -> Forward + Heavy Punch
   * - Crouch Medium -> Standing Heavy -> Ability 1 (236S) -> Ability 2 Follow-up (236P)
   * - Close Heavy -> Ability 3 Projectile (214P) -> Super Art (236236K)
   */
  private tryCancelCombo(input: FighterInput): void {
    if (this.attackElapsed < 0.085) {
      return;
    }

    const dir = this.horizontalDirection(input);
    const holdingForward = dir === this.facing;
    const holdingBack = dir === -this.facing;
    const anyAttack = input.light || input.heavy || input.special;

    // Never cancel out of the meter Super Art itself.
    if (this.activeAbilitySlot === 4) {
      return;
    }

    // Super Art cancel (e.g. from Ability 3 Projectile or Heavy Punch).
    if (
      this.isMeterReady &&
      (input.ability4 ||
        (input.special && !holdingBack && !this.hasMotion('214', 420)) ||
        (this.hasMotion('236236', 680) && (input.heavy || input.special)))
    ) {
      if (this.activeAbilitySlot === 3 && !this.projectileFiredForSwing) {
        this.projectileFiredForSwing = true;
        this.onProjectile?.(this, this.kit.ability3.projectile.name);
      }
      this.startSpecial();
      return;
    }

    // Ability 2 chain immediately after Ability 1.
    if (this.activeAbilitySlot === 1 && (input.ability2 || input.light || input.heavy || input.special)) {
      this.startFollowupSlash(true);
      return;
    }

    // Ability 3 (214P) cancel from normals/abilities.
    if (
      this.abilityCooldowns.arrow <= 0 &&
      this.activeAbilitySlot !== 3 &&
      (input.ability3 || (this.hasMotion('214', 420) && anyAttack) || (holdingBack && input.special))
    ) {
      this.startArrowLaunch();
      return;
    }

    // Standalone Ability 2 cancel from normals via ability2.
    if (this.abilityCooldowns.followup <= 0 && this.activeAbilitySlot !== 2 && input.ability2) {
      this.startFollowupSlash(false);
      return;
    }

    // Ability 1 (236S) cancel from normals.
    if (
      this.abilityCooldowns.cleave <= 0 &&
      this.activeAbilitySlot !== 1 &&
      this.activeAbilitySlot !== 2 &&
      (input.ability1 || (this.hasMotion('236', 420) && anyAttack) || (input.special && !this.isMeterReady))
    ) {
      this.startCleave();
      return;
    }

    // M1 4-hit auto-combo chain: M1-1 -> M1-2 -> M1-3 -> M1-4 Finisher!
    if (this.activeAbilitySlot === 0 && this.m1ComboStep > 0 && this.m1ComboStep < 4 && (input.m1 || input.light)) {
      const nextStep = (this.m1ComboStep + 1) as 2 | 3 | 4;
      this.startM1Step(nextStep);
      return;
    }

    // Basic String fallback: Light / M1 -> Heavy Punch.
    if (
      this.activeAbilitySlot === 0 &&
      (this.currentAnimKey === this.actionKeys.lightPunch || this.currentAnimKey === this.actionKeys.lightKick) &&
      input.heavy
    ) {
      this.startOneShot(this.actionKeys.heavy, holdingForward ? 240 : 100);
      return;
    }

    // Crouch Medium Punch -> Standing Heavy Punch.
    if (
      this.activeAbilitySlot === 0 &&
      this.actionKeys.crouchMedium &&
      this.currentAnimKey === this.actionKeys.crouchMedium &&
      input.heavy
    ) {
      this.startOneShot(this.actionKeys.heavy, holdingForward ? 200 : 80);
    }
  }

  private recordMotion(seconds: number, input: FighterInput): void {
    this.motionClock += seconds * 1000;
    const h = this.horizontalDirection(input) * this.facing;
    let dir = 5;
    if (input.crouch) {
      dir = h > 0 ? 3 : h < 0 ? 1 : 2;
    } else {
      dir = h > 0 ? 6 : h < 0 ? 4 : 5;
    }

    if (dir !== this.lastMotionDir) {
      this.lastMotionDir = dir;
      this.motionBuffer.push({ dir, time: this.motionClock });
      if (this.motionBuffer.length > 24) {
        this.motionBuffer.shift();
      }
    }
  }

  private hasMotion(pattern: '236' | '214' | '236236', windowMs: number): boolean {
    const cutoff = this.motionClock - windowMs;
    const recent = this.motionBuffer.filter((entry) => entry.time >= cutoff).map((entry) => entry.dir);
    if (recent.length === 0) {
      return false;
    }

    if (pattern === '236') {
      return matchSequence(recent, [2, 3, 6]) || matchSequence(recent, [2, 6]);
    }
    if (pattern === '214') {
      return matchSequence(recent, [2, 1, 4]) || matchSequence(recent, [2, 4]);
    }

    return (
      matchSequence(recent, [2, 3, 6, 2, 3, 6]) ||
      matchSequence(recent, [2, 6, 2, 6])
    );
  }

  /**
   * Performs the meter special: consumes the full meter, plays the charge
   * (wind-up) animation, then chains into the multi-hit execution animation, and
   * finally returns to idle. The execution's attack-active spans each open a new
   * hit window so the move lands a combo.
   */
  private startSpecial(): void {
    this.locked = true;
    this.activeAbilitySlot = 4;
    this.m1ComboStep = 0;
    this.meter = 0;
    this.currentReverse = false;
    this.attackId += 1;
    const swingId = this.attackId;
    this.attackElapsed = 0;
    this.attackLungeVel = 0;
    this.attackConnected = true;
    this.attackActiveLast = false;

    this.onSpecialStart?.(this);
    spawnChargeAura(this.scene, this.sprite.x, this.sprite.y - this.sprite.displayHeight * 0.45);

    this.currentAnimKey = this.actionKeys.specialCharge;
    this.sprite.play({ key: this.actionKeys.specialCharge, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${this.actionKeys.specialCharge}`, () => {
      if (this.defeated || this.attackId !== swingId) {
        return;
      }

      // Super freeze: hold the charged pose so the cut-in cinematic peaks before
      // the move launches.
      this.scene.time.delayedCall(SUPER_FREEZE_MS, () => {
        if (!this.defeated && this.attackId === swingId) {
          this.executeSpecial();
        }
      });
    });
  }

  /**
   * Launches the multi-hit special execution animation after the charge/super
   * freeze, then returns to idle. Each attack-active span opens a fresh hit
   * window so the move lands a combo.
   */
  private executeSpecial(): void {
    this.activeAbilitySlot = 4;
    this.m1ComboStep = 0;
    this.currentAnimKey = this.actionKeys.special;
    this.attackId += 1;
    const swingId = this.attackId;
    this.attackConnected = false;
    this.attackActiveLast = false;
    this.onSuperExecute?.(this);

    this.sprite.play({ key: this.actionKeys.special, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${this.actionKeys.special}`, () => {
      if (this.attackId !== swingId) {
        return;
      }

      this.locked = false;
      this.activeAbilitySlot = 0;
      this.m1ComboStep = 0;
      this.currentAnimKey = '';

      if (this.grounded) {
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  /**
   * Opens a fresh hit window each time the attack box turns on after being off,
   * so a single animation with several attack-active spans connects once per
   * span (multi-hit specials). Single-span normal attacks are unaffected.
   */
  private updateAttackWindow(): void {
    const active = this.isAttackActiveFrame();

    if (active && !this.attackActiveLast) {
      this.attackConnected = false;
      this.onAttackVfx?.(this, this.currentAnimKey, this.activeAbilitySlot, this.m1ComboStep);
    }

    this.attackActiveLast = active;
  }

  /**
   * Whether the current animation frame has an attack box (independent of
   * whether the current swing has already connected).
   */
  private isAttackActiveFrame(): boolean {
    if (this.currentAttackKind() === null) {
      return false;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return false;
    }

    return Boolean(this.resolvedFrame(animation).attack);
  }

  /**
   * Whether any frame after the given index in the animation still has an attack
   * box — used to detect the final hit window of a special (the finisher).
   * @param animation - The active animation.
   * @param frameIndex - The current frame index.
   */
  private hasAttackFrameAfter(animation: HeroAnimationDefinition, frameIndex: number): boolean {
    return animation.bounds.some((frame) => frame.frame > frameIndex && frame.attack !== null);
  }

  /** Launches a jump, playing the jump animation while physics drives the arc. */
  private startJump(): void {
    this.grounded = false;
    this.velocityY = -Math.abs(this.stats().jump);
    this.currentAnimKey = this.actionKeys.jump;
    this.currentReverse = false;
    this.sprite.play({ key: this.actionKeys.jump, repeat: 0 }, true);
  }

  /**
   * Redraws the enabled debug bounds (visual/collision/hit/attack) for the
   * fighter's current animation frame, driven by `debugStore.fighterPlayground.
   * bounds`. Boxes active on the current frame draw solid; boxes only active on
   * other frames draw faint using a representative rect.
   */
  private drawBoundsOverlay(): void {
    this.boundsGraphics.clear();

    const bounds = this.app.debugStore.getState().fighterPlayground.bounds;
    if (FIGHTER_BOUNDS_FIELDS.every((field) => !bounds[field.id])) {
      return;
    }

    const animKey = this.sprite.anims.currentAnim?.key ?? this.currentAnimKey;
    if (!animKey) {
      return;
    }

    const animation = getCharacterAnimationDefinition(this.character.id, animKey);
    if (animation.bounds.length === 0) {
      return;
    }

    const boundsFrame = this.resolvedFrame(animation);

    FIGHTER_BOUNDS_FIELDS.forEach((field) => {
      if (!bounds[field.id]) {
        return;
      }

      const active = boundsFrame[field.id];
      const rect = active ?? this.representativeBoundsRect(animation, field.id);
      if (!rect) {
        return;
      }

      this.strokeBoundsRect(animation, rect, BOUNDS_COLORS[field.id], active ? BOUNDS_ALPHA_ACTIVE : BOUNDS_ALPHA_INACTIVE);
    });
  }

  /**
   * Finds the first frame that defines the given bounds kind, used as a faint
   * placeholder on frames where that kind is inactive.
   * @param animation - The animation whose frames are scanned.
   * @param kind - The bounds kind to look up.
   */
  private representativeBoundsRect(
    animation: HeroAnimationDefinition,
    kind: keyof FighterBoundsVisibility
  ): Rect | null {
    for (const frame of animation.bounds) {
      const rect = frame[kind];
      if (rect) {
        return rect;
      }
    }

    return null;
  }

  /**
   * Strokes (and faintly fills) a frame-local rect in world space, accounting
   * for the fighter's origin, scale, and horizontal flip.
   * @param animation - The active animation (for frame dimensions).
   * @param rect - The frame-local rect to draw.
   * @param color - Stroke/fill colour.
   * @param alpha - Stroke alpha (fill uses a fraction of it).
   */
  private strokeBoundsRect(animation: HeroAnimationDefinition, rect: Rect, color: number, alpha: number): void {
    const world = this.frameRectToWorld(animation, rect);

    this.boundsGraphics.fillStyle(color, alpha * 0.18);
    this.boundsGraphics.fillRect(world.x, world.y, world.width, world.height);
    this.boundsGraphics.lineStyle(2, color, alpha);
    this.boundsGraphics.strokeRect(world.x, world.y, world.width, world.height);
  }

  /**
   * Converts a frame-local rect to a world-space rectangle, accounting for the
   * sprite's origin, scale, and horizontal flip.
   * @param animation - The active animation (for frame dimensions).
   * @param rect - The frame-local rect to convert.
   */
  private frameRectToWorld(animation: HeroAnimationDefinition, rect: Rect): Phaser.Geom.Rectangle {
    const frameWidth = animation.sheet.frameWidth;
    const left = this.sprite.x - this.sprite.displayWidth * this.sprite.originX;
    const top = this.sprite.y - this.sprite.displayHeight * this.sprite.originY;
    const scaleX = this.sprite.displayWidth / frameWidth;
    const scaleY = this.sprite.displayHeight / animation.sheet.frameHeight;
    const localX = this.sprite.flipX ? frameWidth - (rect.x + rect.width) : rect.x;

    return new Phaser.Geom.Rectangle(left + localX * scaleX, top + rect.y * scaleY, rect.width * scaleX, rect.height * scaleY);
  }

  /**
   * Resolves the current frame's bounds with the persisted Character Gym
   * overrides applied, so authored hit/attack/guard boxes drive live combat
   * (not just the gym preview).
   * @param animation - The active animation.
   */
  private resolvedFrame(animation: HeroAnimationDefinition): HeroBoundsFrame {
    const overrides = this.app.debugStore.getState().characterGym.boundsOverrides;

    return resolveHeroBoundsFrame(animation, this.currentFrameIndex(animation), overrides);
  }

  /**
   * Resolves the sprite's current animation frame index, clamped to range.
   * @param animation - The active animation.
   */
  private currentFrameIndex(animation: HeroAnimationDefinition): number {
    const frameName = Number(this.sprite.frame.name);
    const lastFrame = animation.sheet.frames - 1;

    if (Number.isFinite(frameName)) {
      return Phaser.Math.Clamp(frameName, 0, lastFrame);
    }

    return 0;
  }

  /** Applies a smooth feet-anchored idle stance breathing motion while standing neutral. */
  private updateIdleAnimation(seconds: number, isIdle: boolean): void {
    const baseScale = this.appliedScale || this.stats().scale;
    if (isIdle) {
      this.idleClock += seconds;
      const breathe = Math.sin(this.idleClock * 4.4);
      this.sprite.setScale(baseScale * (1 + breathe * 0.025), baseScale * (1 - breathe * 0.032));
      this.shadow.setScale(1 + breathe * 0.04);
      return;
    }

    if (this.idleClock !== 0 || this.sprite.scaleX !== baseScale || this.sprite.scaleY !== baseScale) {
      this.idleClock = 0;
      this.sprite.setScale(baseScale);
      if (this.grounded && !this.defeated) {
        this.updateShadow();
      }
    }
  }

  /** Applies an invulnerability glow tint on the sprite while main-ability immunity is active. */
  private updateImmunityVisual(): void {
    if (this.isImmune) {
      const pulse = Math.floor(this.scene.time.now / 70) % 2 === 0;
      this.sprite.setTint(pulse ? 0xbef264 : 0x7dd3fc);
      this.immuneTintApplied = true;
      return;
    }

    if (this.immuneTintApplied) {
      this.immuneTintApplied = false;
      this.sprite.clearTint();
    }
  }

  /** Keeps the ground shadow under the fighter and shrinks it as they rise. */
  private updateShadow(): void {
    const airborneLift = Phaser.Math.Clamp((this.groundY - this.sprite.y) / 220, 0, 1);

    this.shadow.x = this.posX;
    this.shadow.setScale(1 - airborneLift * 0.45);
    this.shadow.setAlpha(0.32 - airborneLift * 0.18);
  }
}

function matchSequence(history: number[], target: number[]): boolean {
  let cursor = 0;

  for (const dir of history) {
    if (dir === target[cursor]) {
      cursor += 1;
      if (cursor >= target.length) {
        return true;
      }
    }
  }

  return false;
}
