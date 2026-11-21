import { getEffectiveVolume } from './core/audio';
import type { Store } from './store';
import { SCENE_KEYS, type GameSettings, type SceneKey } from './types';

export type MusicTrackMode = 'menu' | 'battle';
export type MusicPlaybackSource = 'youtube' | 'synth' | 'loading';

export const BGM_YOUTUBE_VIDEO_ID = 'LQw-a8sApLQ';
export const BGM_YOUTUBE_LIST_ID = 'PL7D6CF7B0A10F2FC6';
export const BGM_YOUTUBE_URL = `https://www.youtube.com/watch?v=${BGM_YOUTUBE_VIDEO_ID}&list=${BGM_YOUTUBE_LIST_ID}`;
export const BGM_TRACK_TITLE = 'Street Fighter II - Ryu Stage (CPS1)';
export const BGM_LOOP_HOURS = 24;
export const BGM_LOOP_DURATION_SECONDS = BGM_LOOP_HOURS * 60 * 60; // 86,400s (24 hours)

export interface BackgroundMusicStatus {
  videoId: string;
  playlistId: string;
  title: string;
  source: MusicPlaybackSource;
  paused: boolean;
  running: boolean;
  durationSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  loopCount: number;
}

interface YouTubePlayerLike {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlayerState?: () => number;
  destroy: () => void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: number;
      height?: number;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YouTubePlayerLike }) => void;
        onStateChange?: (event: { data: number; target: YouTubePlayerLike }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayerLike;
  PlayerState?: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;
const YT_STATE_PAUSED = 2;
const YT_FALLBACK_GRACE_MS = 2200;

// --- Fallback CPS1-inspired Ryu Stage Web Audio Arrangement (166 BPM, C Minor) ---
const STEPS_PER_BAR = 16;
const TOTAL_BARS = 8;
const TOTAL_STEPS = STEPS_PER_BAR * TOTAL_BARS;
const RYU_BPM = 166;
const RYU_INTENSE_BPM = 176;

const RYU_BASS_RIFF: number[] = [
  // Bars 0-1: C2 heroic driving pulse
  36, 0, 36, 48, 36, 0, 36, 48, 36, 0, 36, 48, 36, 43, 46, 48,
  36, 0, 36, 48, 36, 0, 36, 48, 36, 0, 39, 0, 41, 0, 43, 0,
  // Bars 2-3: Ab1 -> Bb1 -> C2 progression
  32, 0, 32, 44, 32, 0, 32, 44, 34, 0, 34, 46, 34, 0, 34, 46,
  36, 0, 36, 48, 36, 0, 43, 0, 41, 0, 39, 0, 38, 0, 43, 0,
  // Bars 4-5: F1 -> G1 -> Ab1 climb
  29, 0, 29, 41, 29, 0, 29, 41, 31, 0, 31, 43, 31, 0, 31, 43,
  32, 0, 32, 44, 34, 0, 34, 46, 36, 0, 36, 48, 43, 0, 48, 0,
  // Bars 6-7: Ab1 -> Bb1 -> G1 turnaround
  32, 0, 32, 44, 32, 0, 32, 44, 34, 0, 34, 46, 34, 0, 34, 46,
  31, 0, 31, 43, 31, 0, 38, 43, 34, 0, 36, 0, 39, 0, 43, 0
];

const RYU_LEAD_RIFF: number[] = [
  // Bars 0-1: Iconic arcade brassy stab & rising heroic motif (C minor)
  72, 0, 72, 0, 79, 0, 77, 75, 74, 0, 72, 0, 74, 75, 77, 0,
  79, 0, 79, 0, 84, 0, 82, 79, 77, 0, 75, 0, 74, 0, 79, 0,
  // Bars 2-3: Soaring Ab -> Bb -> C answer
  80, 0, 80, 0, 79, 77, 75, 0, 82, 0, 82, 0, 80, 79, 77, 0,
  79, 0, 75, 0, 74, 0, 72, 0, 74, 75, 77, 79, 82, 0, 79, 0,
  // Bars 4-5: Driving chorus climb
  77, 0, 77, 79, 80, 0, 77, 0, 79, 0, 79, 80, 82, 0, 79, 0,
  80, 0, 82, 0, 84, 0, 86, 0, 84, 0, 82, 0, 79, 0, 0, 0,
  // Bars 6-7: Triumphant resolution & turnaround
  80, 0, 80, 79, 77, 0, 75, 0, 82, 0, 82, 80, 79, 0, 77, 0,
  79, 0, 74, 0, 75, 77, 79, 0, 82, 0, 84, 0, 86, 0, 84, 0
];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let ytApiPromise: Promise<YouTubeNamespace | null> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeNamespace | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<YouTubeNamespace | null>((resolve) => {
    let settled = false;
    const finish = (yt: YouTubeNamespace | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(yt);
    };

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      finish(window.YT ?? null);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]'
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => finish(null);
      document.head.appendChild(script);
    }

    window.setTimeout(() => {
      if (!settled) {
        finish(window.YT?.Player ? window.YT : null);
      }
    }, 6500);
  });

  return ytApiPromise;
}

/**
 * Formats seconds as `HH:MM:SS` (e.g. `24:00:00`).
 */
export function formatDurationHms(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Background Music Engine:
 * - Plays the requested YouTube soundtrack (`LQw-a8sApLQ`, Ryu Stage CPS1) via the
 *   YouTube IFrame Player API and loops it continuously for 24 hours (86,400s).
 * - Automatically falls back to an inline Web Audio CPS1 Ryu Stage synth if YouTube
 *   cannot play (offline, blocked embed, or restricted sandbox) and immediately hands
 *   back control if YouTube begins playback.
 */
export class BackgroundMusicEngine {
  private ytPlayer: YouTubePlayerLike | null = null;
  private ytHostEl: HTMLElement | null = null;
  private ytReady = false;
  private ytActive = false;
  private ytFailed = false;
  private ytInitializing = false;
  private fallbackTimerId: number | null = null;

  // Web Audio fallback nodes
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private synthTimerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;

  // 24-hour continuous playback tracking
  private watchdogTimerId: number | null = null;
  private lastTickMs = 0;
  private elapsedMs = 0;
  private loopCount = 0;
  private lastLoopSeekMs = 0;

  private running = false;
  private paused = false;
  private intense = false;
  private mode: MusicTrackMode = 'menu';
  private targetVolume = 0.6;
  private userGestured = false;

  private pauseListeners = new Set<(paused: boolean) => void>();
  private statusListeners = new Set<(status: BackgroundMusicStatus) => void>();

  start(settings: GameSettings, mode: MusicTrackMode = 'menu'): void {
    this.setMode(mode);
    this.updateVolume(settings);

    if (this.running) {
      void this.resumeIfSuspended();
      return;
    }

    this.running = true;
    this.lastTickMs = Date.now();
    this.startWatchdog();
    void this.initYouTubePlayer();
    this.scheduleFallbackCheck();
    this.emitStatus();
  }

  setMode(mode: MusicTrackMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    if (mode === 'menu') {
      this.intense = false;
    }
  }

  async resumeIfSuspended(): Promise<void> {
    this.userGestured = true;
    if (!this.running) {
      return;
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore until next user gesture
      }
    }

    if (this.paused || this.targetVolume <= 0 || this.is24HourCompleted()) {
      return;
    }

    if (this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.unMute();
        this.ytPlayer.setVolume(Math.round(this.targetVolume * 100));
        const state = this.ytPlayer.getPlayerState?.();
        if (state !== YT_STATE_PLAYING) {
          this.ytPlayer.playVideo();
        }
      } catch {
        this.ytFailed = true;
      }
    }

    this.scheduleFallbackCheck();
  }

  updateVolume(settings: GameSettings): void {
    this.targetVolume = getEffectiveVolume(0.62, 'music', settings);
    this.applyVolume();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }
    this.paused = paused;
    if (!paused && this.is24HourCompleted()) {
      this.elapsedMs = 0;
      this.loopCount = 0;
    }
    this.applyVolume();

    if (this.ytPlayer && this.ytReady) {
      try {
        if (this.paused) {
          this.ytPlayer.pauseVideo();
        } else if (this.running && this.targetVolume > 0) {
          this.ytPlayer.unMute();
          this.ytPlayer.setVolume(Math.round(this.targetVolume * 100));
          this.ytPlayer.playVideo();
        }
      } catch {
        // Ignore player error
      }
    }

    if (!this.paused && this.running && !this.ytActive) {
      this.scheduleFallbackCheck();
    }

    this.pauseListeners.forEach((listener) => listener(this.paused));
    this.emitStatus();
  }

  togglePaused(): boolean {
    this.setPaused(!this.paused);
    return this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  subscribePause(listener: (paused: boolean) => void): () => void {
    this.pauseListeners.add(listener);
    listener(this.paused);
    return () => {
      this.pauseListeners.delete(listener);
    };
  }

  subscribeStatus(listener: (status: BackgroundMusicStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getStatus(): BackgroundMusicStatus {
    const elapsedSeconds = Math.min(
      BGM_LOOP_DURATION_SECONDS,
      Math.floor(this.elapsedMs / 1000)
    );
    const remainingSeconds = Math.max(0, BGM_LOOP_DURATION_SECONDS - elapsedSeconds);
    const source: MusicPlaybackSource = this.ytActive
      ? 'youtube'
      : this.synthTimerId !== null || this.ytFailed
        ? 'synth'
        : 'loading';

    return {
      videoId: BGM_YOUTUBE_VIDEO_ID,
      playlistId: BGM_YOUTUBE_LIST_ID,
      title: BGM_TRACK_TITLE,
      source,
      paused: this.paused,
      running: this.running,
      durationSeconds: BGM_LOOP_DURATION_SECONDS,
      elapsedSeconds,
      remainingSeconds,
      loopCount: this.loopCount
    };
  }

  /**
   * Advances the internal 24-hour clock by `deltaMs` (useful for tests and watchdog ticks).
   */
  tickPlaybackClock(deltaMs: number): void {
    if (!this.running || this.paused || this.targetVolume <= 0 || deltaMs <= 0) {
      return;
    }
    const maxMs = BGM_LOOP_DURATION_SECONDS * 1000;
    this.elapsedMs = Math.min(maxMs, this.elapsedMs + deltaMs);
    if (this.elapsedMs >= maxMs) {
      this.stop();
    }
  }

  reset24HourLoop(): void {
    this.elapsedMs = 0;
    this.loopCount = 0;
    this.lastTickMs = Date.now();
    this.emitStatus();
  }

  setIntensity(intense: boolean): void {
    this.intense = intense;
  }

  stop(): void {
    this.running = false;
    this.clearFallbackTimer();
    this.stopWatchdog();
    this.stopSynth();
    if (this.ytPlayer && this.ytReady) {
      try {
        this.ytPlayer.pauseVideo();
      } catch {
        // Ignore
      }
    }
    this.emitStatus();
  }

  destroy(): void {
    this.stop();
    if (this.ytPlayer) {
      try {
        this.ytPlayer.destroy();
      } catch {
        // Ignore
      }
      this.ytPlayer = null;
      this.ytReady = false;
      this.ytActive = false;
    }
    if (this.ytHostEl) {
      this.ytHostEl.remove();
      this.ytHostEl = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.noiseBuffer = null;
    }
  }

  private is24HourCompleted(): boolean {
    return this.elapsedMs >= BGM_LOOP_DURATION_SECONDS * 1000;
  }

  private async initYouTubePlayer(): Promise<void> {
    if (this.ytPlayer || this.ytInitializing || this.ytFailed) {
      return;
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.ytFailed = true;
      return;
    }

    this.ytInitializing = true;
    const yt = await loadYouTubeIframeApi();
    this.ytInitializing = false;

    if (!yt?.Player || !this.running) {
      this.ytFailed = true;
      this.ensureSynthFallback();
      this.emitStatus();
      return;
    }

    const host = this.ensureYouTubeHostElement();
    const playerMount = document.createElement('div');
    host.appendChild(playerMount);

    try {
      this.ytPlayer = new yt.Player(playerMount, {
        width: 240,
        height: 135,
        videoId: BGM_YOUTUBE_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: BGM_YOUTUBE_VIDEO_ID,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            this.ytReady = true;
            this.applyVolume();
            if (!this.paused && this.running && this.targetVolume > 0 && !this.is24HourCompleted()) {
              try {
                event.target.unMute();
                event.target.setVolume(Math.round(this.targetVolume * 100));
                event.target.playVideo();
              } catch {
                this.ytFailed = true;
                this.ensureSynthFallback();
              }
            }
          },
          onStateChange: (event) => {
            if (event.data === YT_STATE_PLAYING) {
              this.ytActive = true;
              this.ytFailed = false;
              this.clearFallbackTimer();
              this.stopSynth();
              this.applyVolume();
              this.emitStatus();
              return;
            }

            if (event.data === YT_STATE_ENDED) {
              if (this.running && !this.paused && !this.is24HourCompleted()) {
                this.loopYouTubeTrack(event.target);
              }
              return;
            }

            if (event.data === YT_STATE_PAUSED && !this.paused) {
              this.ytActive = false;
              this.emitStatus();
            }
          },
          onError: () => {
            this.ytActive = false;
            this.ytFailed = true;
            this.ensureSynthFallback();
            this.emitStatus();
          }
        }
      });
    } catch {
      this.ytFailed = true;
      this.ensureSynthFallback();
      this.emitStatus();
    }
  }

  private loopYouTubeTrack(player: YouTubePlayerLike): void {
    const now = Date.now();
    if (now - this.lastLoopSeekMs < 1500) {
      return;
    }
    this.lastLoopSeekMs = now;
    this.loopCount += 1;
    try {
      player.seekTo(0, true);
      player.playVideo();
      this.emitStatus();
    } catch {
      this.ytFailed = true;
      this.ensureSynthFallback();
    }
  }

  private ensureYouTubeHostElement(): HTMLElement {
    if (this.ytHostEl && this.ytHostEl.isConnected) {
      return this.ytHostEl;
    }

    const existing = document.getElementById('yt-bgm-player-host');
    if (existing) {
      this.ytHostEl = existing;
      return existing;
    }

    const container = document.createElement('div');
    container.id = 'yt-bgm-player-host';
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '240px';
    container.style.height = '135px';
    container.style.opacity = '0.01';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '-1';
    document.body.appendChild(container);
    this.ytHostEl = container;
    return container;
  }

  private scheduleFallbackCheck(): void {
    if (typeof window === 'undefined' || this.ytActive || this.paused) {
      return;
    }
    if (this.ytFailed) {
      this.ensureSynthFallback();
      return;
    }
    if (this.fallbackTimerId !== null) {
      return;
    }
    this.fallbackTimerId = window.setTimeout(() => {
      this.fallbackTimerId = null;
      if (this.running && !this.paused && !this.ytActive && this.userGestured) {
        this.ensureSynthFallback();
      }
    }, YT_FALLBACK_GRACE_MS);
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimerId !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.fallbackTimerId);
      this.fallbackTimerId = null;
    }
  }

  private startWatchdog(): void {
    if (typeof window === 'undefined' || this.watchdogTimerId !== null) {
      return;
    }
    this.lastTickMs = Date.now();
    this.watchdogTimerId = window.setInterval(() => {
      const now = Date.now();
      const delta = Math.min(5000, Math.max(0, now - this.lastTickMs));
      this.lastTickMs = now;

      const isActivelyPlaying =
        this.running &&
        !this.paused &&
        this.targetVolume > 0 &&
        (this.ytActive || this.synthTimerId !== null);

      if (isActivelyPlaying) {
        this.tickPlaybackClock(delta);
      }

      // Backup seamless loop check near end of YouTube video for 24h continuous playback
      if (
        this.running &&
        !this.paused &&
        this.ytPlayer &&
        this.ytReady &&
        !this.is24HourCompleted()
      ) {
        try {
          const duration = this.ytPlayer.getDuration?.() ?? 0;
          const current = this.ytPlayer.getCurrentTime?.() ?? 0;
          const state = this.ytPlayer.getPlayerState?.();
          if (
            state === YT_STATE_ENDED ||
            (duration > 5 && current >= duration - 0.45 && state === YT_STATE_PLAYING)
          ) {
            this.loopYouTubeTrack(this.ytPlayer);
          }
        } catch {
          // Ignore transient iframe read failures
        }
      }

      this.emitStatus();
    }, 1000);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.watchdogTimerId);
      this.watchdogTimerId = null;
    }
  }

  private applyVolume(): void {
    const effective = this.paused || !this.running ? 0 : this.targetVolume;

    if (this.ytPlayer && this.ytReady) {
      try {
        if (effective <= 0) {
          this.ytPlayer.mute();
        } else {
          this.ytPlayer.unMute();
          this.ytPlayer.setVolume(Math.round(effective * 100));
        }
      } catch {
        // Ignore
      }
    }

    if (this.masterGain && this.ctx) {
      const synthLevel = this.ytActive ? 0 : effective;
      this.masterGain.gain.setTargetAtTime(synthLevel, this.ctx.currentTime, 0.04);
    }
  }

  private emitStatus(): void {
    const status = this.getStatus();
    this.statusListeners.forEach((listener) => listener(status));
  }

  // --- Inline Web Audio Fallback (Ryu Stage CPS1 Arrangement) ---

  private ensureSynthFallback(): void {
    if (
      typeof window === 'undefined' ||
      !this.running ||
      this.paused ||
      this.ytActive ||
      this.synthTimerId !== null ||
      this.is24HourCompleted()
    ) {
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(16, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.16, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.paused ? 0 : this.targetVolume,
        this.ctx.currentTime
      );

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }

    this.applyVolume();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.synthTimerId = window.setInterval(() => this.schedulerTick(), 35);
    this.emitStatus();
  }

  private stopSynth(): void {
    if (this.synthTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.synthTimerId);
      this.synthTimerId = null;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    }
  }

  private schedulerTick(): void {
    if (!this.running || this.ytActive || !this.ctx || this.ctx.state !== 'running') {
      return;
    }

    const bpm = this.intense ? RYU_INTENSE_BPM : RYU_BPM;
    const stepDuration = 60 / bpm / 4;

    if (this.nextNoteTime < this.ctx.currentTime - 0.35) {
      this.nextNoteTime = this.ctx.currentTime + 0.04;
    }

    while (this.nextNoteTime < this.ctx.currentTime + 0.16) {
      this.scheduleRyuStep(this.currentStep, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      const next = (this.currentStep + 1) % TOTAL_STEPS;
      if (next === 0) {
        this.loopCount += 1;
      }
      this.currentStep = next;
    }
  }

  private scheduleRyuStep(step: number, time: number, stepDuration: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const beatStep = step % STEPS_PER_BAR;

    if (beatStep === 0 && (bar === 0 || bar === 4)) {
      this.triggerCrash(time, 0.16);
    }

    if (beatStep === 0 || beatStep === 3 || beatStep === 6 || beatStep === 10 || (bar % 2 === 1 && beatStep === 14)) {
      this.triggerKick(time, 0.52);
    }

    if (beatStep === 4 || beatStep === 12 || (bar % 4 === 3 && beatStep >= 14)) {
      this.triggerSnare(time, beatStep >= 14 ? 0.22 : 0.3);
    }

    if (beatStep % 2 === 0) {
      this.triggerHat(time, beatStep % 4 === 2 ? 0.11 : 0.06);
    }

    const bass = RYU_BASS_RIFF[step];
    if (bass > 0) {
      this.triggerFmBass(time, midiToHz(bass), stepDuration * 1.1, 0.24);
    }

    const lead = RYU_LEAD_RIFF[step];
    if (lead > 0) {
      this.triggerFmBrassLead(time, midiToHz(lead), stepDuration * 1.65, 0.14);
    }
  }

  private triggerKick(time: number, level: number): void {
    if (!this.ctx || !this.compressor) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.1);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    osc.connect(gain);
    gain.connect(this.compressor);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private triggerSnare(time: number, level: number): void {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2100, time);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(level, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.compressor);
    noise.start(time);
    noise.stop(time + 0.13);
  }

  private triggerHat(time: number, level: number): void {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(7600, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(hp);
    hp.connect(gain);
    gain.connect(this.compressor);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  private triggerCrash(time: number, level: number): void {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(4200, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
    noise.connect(hp);
    hp.connect(gain);
    gain.connect(this.compressor);
    noise.start(time);
    noise.stop(time + 0.25);
  }

  private triggerFmBass(time: number, freq: number, duration: number, level: number): void {
    if (!this.ctx || !this.compressor) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1250, time);
    filter.frequency.exponentialRampToValueAtTime(280, time + duration);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private triggerFmBrassLead(time: number, freq: number, duration: number, level: number): void {
    if (!this.ctx || !this.compressor) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.004, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3100, time);
    filter.frequency.exponentialRampToValueAtTime(1200, time + duration);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.02);
    osc2.stop(time + duration + 0.02);
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.3);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

let sharedMusic: BackgroundMusicEngine | null = null;
let initializedListeners = false;

export function getBackgroundMusic(): BackgroundMusicEngine {
  sharedMusic ??= new BackgroundMusicEngine();
  return sharedMusic;
}

export function syncSceneBackgroundMusic(sceneKey: SceneKey, settingsStore: Store<GameSettings>): void {
  if (sceneKey === SCENE_KEYS.Boot) {
    return;
  }

  const engine = getBackgroundMusic();
  const mode: MusicTrackMode = sceneKey === SCENE_KEYS.Match ? 'battle' : 'menu';
  engine.start(settingsStore.getState(), mode);

  if (!initializedListeners && typeof window !== 'undefined') {
    initializedListeners = true;
    settingsStore.subscribe((settings) => engine.updateVolume(settings));
    const unlock = (): void => {
      void engine.resumeIfSuspended();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }
}
