// All audio is synthesised with the Web Audio API: SFX voices and a tiny step-sequencer for music.

import { THEMES } from '../data/themes';

export type SfxName =
  | 'arrow' | 'cannon' | 'frost' | 'lightning' | 'hit' | 'death' | 'bossDeath' | 'leak' | 'coin' | 'build' | 'upgrade'
  | 'sell' | 'click' | 'waveStart' | 'waveClear' | 'victory' | 'defeat' | 'arrowRain' | 'meteor' | 'taunt' | 'heal'
  | 'bossRoar' | 'error' | 'chest' | 'reward' | 'select' | 'heroHit' | 'immune' | 'star' | 'aura'
  | 'arcane' | 'ballista' | 'flame' | 'poison'
  | 'catapult' | 'gust' | 'mineGold' | 'freeze' | 'blessing' | 'repair' | 'thunder' | 'nightfall' | 'dawn' | 'checkpoint';

export type MusicTrack = 'menu' | 'meadow' | 'desert' | 'snow' | 'volcano' | 'none';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private muted = false;
  private track: MusicTrack = 'none';
  private schedTimer = 0;
  private nextNoteTime = 0;
  private step = 0;
  private pattern: { bass: number[]; lead: (number | null)[]; chords: number[][]; bpm: number; wave: OscillatorType; drums: boolean } | null = null;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.connect(comp);
    this.sfxGain.connect(comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.track !== 'none') {
      const t = this.track;
      this.track = 'none';
      this.playMusic(t);
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  /** Mute everything (used while ads play). */
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted) void this.ctx.resume();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.musicVol * 0.32, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol * 0.7, t, 0.02);
  }

  // --- Voices ------------------------------------------------------------------

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; attack?: number; delay?: number; dest?: AudioNode; filter?: number } = {}): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.dest ?? this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseHit(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', opts: { slide?: number; delay?: number; dest?: AudioNode; q?: number } = {}): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (opts.q) f.Q.value = opts.q;
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(opts.dest ?? this.sfxGain);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  play(name: SfxName, intensity = 1): void {
    if (!this.ctx || this.ctx.state !== 'running' || this.sfxVol <= 0) return;
    // Throttle identical sounds so big fights don't clip.
    const now = this.ctx.currentTime;
    const minGap = name === 'hit' || name === 'arrow' ? 0.05 : name === 'flame' ? 0.12 : name === 'death' || name === 'coin' ? 0.04 : 0.02;
    if (now - (this.last.get(name) ?? -1) < minGap) return;
    this.last.set(name, now);
    const v = intensity;
    switch (name) {
      case 'arrow':
        this.noiseHit(0.09, 0.25 * v, 3000, 'bandpass', { slide: 900, q: 2 });
        break;
      case 'cannon':
        this.tone(110, 0.35, 'sine', 0.7 * v, { slide: 40 });
        this.noiseHit(0.4, 0.45 * v, 900, 'lowpass', { slide: 120 });
        break;
      case 'frost':
        this.tone(1400, 0.18, 'sine', 0.12 * v, { slide: 2200 });
        this.tone(2100, 0.22, 'triangle', 0.06 * v, { delay: 0.03 });
        break;
      case 'lightning':
        this.noiseHit(0.22, 0.35 * v, 5000, 'highpass');
        this.tone(220, 0.18, 'sawtooth', 0.12 * v, { slide: 60, filter: 2400 });
        break;
      case 'arcane':
        this.tone(520, 0.2, 'sine', 0.12 * v, { slide: 1040 });
        this.tone(780, 0.25, 'triangle', 0.06 * v, { delay: 0.04, slide: 1560 });
        break;
      case 'ballista':
        this.tone(160, 0.12, 'triangle', 0.25 * v, { slide: 70 });
        this.noiseHit(0.16, 0.3 * v, 1400, 'bandpass', { slide: 500, q: 1.5 });
        break;
      case 'flame':
        this.noiseHit(0.25, 0.18 * v, 700, 'lowpass', { slide: 1800 });
        break;
      case 'poison':
        this.tone(300, 0.12, 'sine', 0.1 * v, { slide: 600 });
        this.tone(460, 0.1, 'sine', 0.07 * v, { delay: 0.08, slide: 820 });
        break;
      case 'hit':
        this.noiseHit(0.05, 0.12 * v, 1800, 'bandpass', { q: 1 });
        break;
      case 'death':
        this.tone(420, 0.14, 'square', 0.08 * v, { slide: 120, filter: 1800 });
        this.noiseHit(0.08, 0.1 * v, 2000);
        break;
      case 'bossDeath':
        this.tone(160, 1.2, 'sawtooth', 0.35, { slide: 30, filter: 900 });
        this.noiseHit(1.2, 0.5, 1200, 'lowpass', { slide: 80 });
        [0, 0.15, 0.3].forEach((d, i) => this.tone(mtof(72 + i * 4), 0.4, 'triangle', 0.15, { delay: 0.6 + d }));
        break;
      case 'leak':
        this.tone(180, 0.3, 'square', 0.18, { slide: 90, filter: 1200 });
        this.noiseHit(0.2, 0.2, 600);
        break;
      case 'coin':
        this.tone(1318, 0.07, 'square', 0.06, { filter: 4000 });
        this.tone(1760, 0.14, 'square', 0.06, { delay: 0.06, filter: 4000 });
        break;
      case 'build':
        this.noiseHit(0.18, 0.25, 700, 'lowpass', { slide: 200 });
        [0, 4, 7].forEach((n, i) => this.tone(mtof(60 + n), 0.22, 'triangle', 0.14, { delay: 0.05 + i * 0.05 }));
        break;
      case 'upgrade':
        [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(67 + n), 0.22, 'triangle', 0.15, { delay: i * 0.06 }));
        this.tone(mtof(91), 0.4, 'sine', 0.06, { delay: 0.24 });
        break;
      case 'sell':
        [7, 4, 0].forEach((n, i) => this.tone(mtof(72 + n), 0.12, 'square', 0.06, { delay: i * 0.05, filter: 3000 }));
        break;
      case 'click':
        this.tone(900, 0.05, 'triangle', 0.12, { slide: 600 });
        break;
      case 'select':
        this.tone(660, 0.07, 'triangle', 0.12);
        this.tone(990, 0.09, 'triangle', 0.1, { delay: 0.04 });
        break;
      case 'error':
        this.tone(200, 0.16, 'square', 0.1, { filter: 1000 });
        this.tone(150, 0.2, 'square', 0.1, { delay: 0.08, filter: 1000 });
        break;
      case 'waveStart':
        this.tone(mtof(55), 0.5, 'sawtooth', 0.14, { attack: 0.06, filter: 1400 });
        this.tone(mtof(62), 0.7, 'sawtooth', 0.14, { attack: 0.06, delay: 0.25, filter: 1400 });
        this.noiseHit(0.15, 0.25, 300, 'lowpass', { delay: 0.0 });
        break;
      case 'waveClear':
        [0, 4, 7].forEach((n, i) => this.tone(mtof(72 + n), 0.18, 'triangle', 0.12, { delay: i * 0.07 }));
        break;
      case 'victory':
        [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(mtof(64 + n), i === 6 ? 0.8 : 0.2, 'triangle', 0.18, { delay: i * 0.12 }));
        break;
      case 'defeat':
        [7, 6, 5, 0].forEach((n, i) => this.tone(mtof(55 + n), i === 3 ? 0.9 : 0.3, 'sawtooth', 0.12, { delay: i * 0.25, filter: 900 }));
        break;
      case 'arrowRain':
        for (let i = 0; i < 8; i++) this.noiseHit(0.08, 0.18, 3500, 'bandpass', { delay: i * 0.05, slide: 1200, q: 2 });
        break;
      case 'meteor':
        this.noiseHit(0.6, 0.35, 600, 'lowpass', { slide: 3000 });
        this.tone(90, 0.7, 'sine', 0.8, { delay: 0.45, slide: 30 });
        this.noiseHit(0.8, 0.6, 1500, 'lowpass', { delay: 0.45, slide: 100 });
        break;
      case 'taunt':
        this.tone(140, 0.5, 'sawtooth', 0.25, { slide: 90, filter: 800 });
        this.tone(210, 0.5, 'sawtooth', 0.15, { slide: 130, filter: 800 });
        break;
      case 'heal':
        this.tone(880, 0.25, 'sine', 0.05, { slide: 1320 });
        break;
      case 'bossRoar':
        this.tone(90, 1.0, 'sawtooth', 0.3, { slide: 55, attack: 0.1, filter: 700 });
        this.noiseHit(1.0, 0.3, 500, 'lowpass');
        break;
      case 'immune':
        this.tone(1200, 0.3, 'sine', 0.1);
        this.tone(1800, 0.3, 'sine', 0.06, { delay: 0.05 });
        break;
      case 'chest':
        this.noiseHit(0.3, 0.3, 900, 'lowpass');
        [0, 4, 7, 11, 14].forEach((n, i) => this.tone(mtof(72 + n), 0.3, 'triangle', 0.13, { delay: 0.2 + i * 0.07 }));
        break;
      case 'reward':
        [0, 7, 12].forEach((n, i) => this.tone(mtof(76 + n), 0.2, 'square', 0.07, { delay: i * 0.06, filter: 3500 }));
        break;
      case 'star':
        this.tone(mtof(84), 0.25, 'triangle', 0.18);
        this.tone(mtof(91), 0.3, 'sine', 0.08, { delay: 0.05 });
        break;
      case 'heroHit':
        this.noiseHit(0.08, 0.2, 1200, 'bandpass');
        break;
      case 'aura':
        this.noiseHit(0.25, 0.08, 4000, 'highpass');
        break;
      case 'catapult':
        // Creak of the arm, then the whoosh of the throw.
        this.tone(140, 0.18, 'sawtooth', 0.1 * v, { slide: 90, filter: 700 });
        this.noiseHit(0.3, 0.22 * v, 500, 'bandpass', { delay: 0.08, slide: 1600, q: 1.2 });
        break;
      case 'gust':
        this.noiseHit(0.45, 0.22 * v, 400, 'bandpass', { slide: 2400, q: 0.8 });
        this.noiseHit(0.35, 0.1 * v, 3000, 'highpass', { delay: 0.1 });
        break;
      case 'mineGold':
        [0, 7, 12, 16].forEach((n, i) => this.tone(mtof(79 + n), 0.12, 'triangle', 0.09, { delay: i * 0.05 }));
        this.noiseHit(0.08, 0.12, 6000, 'highpass');
        break;
      case 'freeze':
        this.noiseHit(0.6, 0.25, 6000, 'highpass', { slide: 9000 });
        [0, 5, 10, 15].forEach((n, i) => this.tone(mtof(84 + n), 0.5, 'sine', 0.06, { delay: i * 0.06 }));
        break;
      case 'blessing':
        [0, 4, 7, 12, 16, 19].forEach((n, i) => this.tone(mtof(76 + n), 0.35, 'triangle', 0.09, { delay: i * 0.06 }));
        this.tone(mtof(100), 0.8, 'sine', 0.04, { delay: 0.35 });
        break;
      case 'repair':
        for (let i = 0; i < 3; i++) {
          this.tone(320, 0.08, 'square', 0.1, { delay: i * 0.16, filter: 1600 });
          this.noiseHit(0.06, 0.2, 2500, 'bandpass', { delay: i * 0.16, q: 2 });
        }
        [0, 4, 7].forEach((n, i) => this.tone(mtof(72 + n), 0.25, 'triangle', 0.1, { delay: 0.5 + i * 0.06 }));
        break;
      case 'thunder':
        this.noiseHit(1.8, 0.55 * v, 300, 'lowpass', { slide: 60 });
        this.noiseHit(0.2, 0.3 * v, 2500, 'lowpass', { slide: 400 });
        this.tone(55, 1.4, 'sine', 0.3 * v, { slide: 35, attack: 0.05 });
        break;
      case 'nightfall':
        // A low hush and a soft falling call.
        this.tone(mtof(57), 1.4, 'sine', 0.12, { attack: 0.3 });
        this.tone(mtof(64), 1.4, 'sine', 0.08, { attack: 0.3, delay: 0.1 });
        this.tone(mtof(76), 0.3, 'triangle', 0.08, { delay: 0.6, slide: mtof(72) });
        this.tone(mtof(76), 0.35, 'triangle', 0.08, { delay: 1.0, slide: mtof(71) });
        break;
      case 'dawn':
        [0, 4, 7, 11, 14].forEach((n, i) => this.tone(mtof(67 + n), 0.5, 'triangle', 0.08, { delay: i * 0.12, attack: 0.04 }));
        break;
      case 'checkpoint':
        [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(67 + n), 0.18, 'square', 0.08, { delay: i * 0.1, filter: 3000 }));
        [12, 16, 19, 24].forEach((n) => this.tone(mtof(67 + n), 0.9, 'triangle', 0.07, { delay: 0.45 }));
        this.noiseHit(0.5, 0.12, 6000, 'highpass', { delay: 0.45 });
        break;
    }
  }

  // --- Ambience (weather) ----------------------------------------------------------

  private amb: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; kind: 'rain' | 'wind' } | null = null;

  /** Rain hiss or howling wind under the music, faded by `level` (0..1). */
  setAmbience(kind: 'rain' | 'wind' | 'none', level: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (this.amb && (kind === 'none' || this.amb.kind !== kind) && level <= 0.01) {
      this.amb.src.stop();
      this.amb = null;
    }
    if (kind === 'none') {
      if (this.amb) this.amb.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      return;
    }
    if (!this.amb) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = kind === 'rain' ? 'highpass' : 'bandpass';
      filter.frequency.value = kind === 'rain' ? 1800 : 500;
      filter.Q.value = kind === 'rain' ? 0.5 : 0.9;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start();
      this.amb = { src, filter, gain, kind };
    }
    const t = ctx.currentTime;
    this.amb.gain.gain.setTargetAtTime((kind === 'rain' ? 0.16 : 0.12) * level, t, 0.4);
    // Wind gusts: the band sweeps slowly.
    if (kind === 'wind') this.amb.filter.frequency.setTargetAtTime(380 + 260 * (0.5 + 0.5 * Math.sin(t * 0.7)), t, 0.5);
  }

  // --- Music -------------------------------------------------------------------

  playMusic(track: MusicTrack): void {
    if (track === this.track) return;
    this.track = track;
    window.clearInterval(this.schedTimer);
    if (!this.ctx || track === 'none') return;
    this.pattern = this.buildPattern(track);
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.schedTimer = window.setInterval(() => this.schedule(), 50);
  }

  private buildPattern(track: MusicTrack) {
    let root = 60;
    let scale = [0, 2, 4, 7, 9];
    let bpm = 92;
    let wave: OscillatorType = 'triangle';
    let drums = false;
    const chap = THEMES.find((c) => c.id === track);
    if (chap) {
      root = chap.music.root;
      scale = chap.music.scale;
      bpm = chap.music.bpm;
      wave = chap.music.wave;
      drums = true;
    }
    const deg = (d: number) => {
      const o = Math.floor(d / scale.length);
      return root + scale[((d % scale.length) + scale.length) % scale.length] + 12 * o;
    };
    // I - VI - IV - V style progression in scale degrees.
    const prog = [0, 5, 3, 4];
    const chords = prog.map((p) => [deg(p), deg(p + 2), deg(p + 4)]);
    const bass = prog.map((p) => deg(p) - 24);
    // Melody: deterministic pseudo-random walk over 32 eighth steps.
    let seed = root * 31 + bpm;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const lead: (number | null)[] = [];
    let cur = 7;
    for (let i = 0; i < 32; i++) {
      if (rnd() < 0.3) {
        lead.push(null);
        continue;
      }
      cur = Math.max(3, Math.min(12, cur + Math.floor(rnd() * 5) - 2));
      lead.push(deg(cur));
    }
    return { bass, lead, chords, bpm, wave, drums };
  }

  private schedule(): void {
    const ctx = this.ctx;
    const p = this.pattern;
    if (!ctx || !p || ctx.state !== 'running') return;
    const stepDur = 60 / p.bpm / 2;
    while (this.nextNoteTime < ctx.currentTime + 0.2) {
      const t = this.nextNoteTime - ctx.currentTime;
      const s = this.step % 32;
      const bar = Math.floor(s / 8);
      const d = { dest: this.musicGain, delay: Math.max(0, t) };
      if (s % 8 === 0) {
        for (const n of p.chords[bar]) this.tone(mtof(n), stepDur * 7, p.wave === 'square' ? 'triangle' : 'sine', 0.05, { ...d, attack: 0.08 });
      }
      if (s % 2 === 0) this.tone(mtof(p.bass[bar] + (s % 4 === 2 ? 12 : 0)), stepDur * 1.6, 'triangle', 0.16, { ...d, filter: 600 });
      const n = p.lead[s];
      if (n !== null) this.tone(mtof(n), stepDur * 0.9, p.wave, 0.06, { ...d, filter: 2600 });
      if (p.drums) {
        if (s % 4 === 0) this.tone(120, 0.12, 'sine', 0.25, { ...d, slide: 45 });
        if (s % 2 === 1) this.noiseHit(0.04, 0.05, 7000, 'highpass', d);
        if (s % 8 === 4) this.noiseHit(0.12, 0.12, 1800, 'bandpass', d);
      }
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }
}
