/**
 * Procedural sound for VARIABLE, synthesised with the Web Audio API (no audio
 * files): transformation servos and lock clunks, the FF-2001 turbines' whine
 * and jet roar with an overboost rumble, the Battroid's footfalls, vernier
 * blasts and landings, and soft UI ticks. Silent until a user gesture unlocks
 * audio (browser autoplay rules) and whenever muted; a no-op without Web Audio.
 */

type Ctor = typeof AudioContext;
const audioCtor = (): Ctor | undefined =>
  typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;

const MASTER = 0.75;

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private servo: { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private turbine: { a: OscillatorNode; b: OscillatorNode; gain: GainNode } | null = null;
  private roar: { filter: BiquadFilterNode; gain: GainNode; rumble: BiquadFilterNode; rumbleGain: GainNode } | null = null;
  private muted = false;
  /** Levels and counters, for the automation hooks and tests. */
  readonly stats = { servo: 0, turbine: 0, roar: 0, oneShots: 0 };

  get supported(): boolean {
    return !!audioCtor();
  }

  /** 'none' before the first gesture, then the AudioContext state. */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Create or resume the audio graph. Must be called from a user gesture. */
  unlock(): void {
    const C = audioCtor();
    if (!C) return;
    if (!this.ctx) this.build(new C());
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.04);
  }

  private build(ctx: AudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : MASTER;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Servos: two detuned saws through a resonant band-pass (electric actuator whine).
    const sg = ctx.createGain();
    sg.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.Q.value = 6;
    sf.frequency.value = 600;
    const sa = ctx.createOscillator();
    sa.type = 'sawtooth';
    const sb = ctx.createOscillator();
    sb.type = 'sawtooth';
    sb.detune.value = 14;
    sa.connect(sf);
    sb.connect(sf);
    sf.connect(sg).connect(master);
    sa.start();
    sb.start();
    this.servo = { a: sa, b: sb, filter: sf, gain: sg };

    // Turbine whine: a sine and its fifth, pitched by spool.
    const tg = ctx.createGain();
    tg.gain.value = 0;
    const ta = ctx.createOscillator();
    ta.type = 'sine';
    const tb = ctx.createOscillator();
    tb.type = 'triangle';
    ta.connect(tg);
    tb.connect(tg);
    tg.connect(master);
    ta.start();
    tb.start();
    this.turbine = { a: ta, b: tb, gain: tg };

    // Jet roar: looped noise through a spool-scaled low-pass, plus a low rumble band for overboost.
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 500;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    const rb = ctx.createBiquadFilter();
    rb.type = 'bandpass';
    rb.frequency.value = 70;
    rb.Q.value = 0.8;
    const rbg = ctx.createGain();
    rbg.gain.value = 0;
    src.connect(rf).connect(rg).connect(master);
    src.connect(rb).connect(rbg).connect(master);
    src.start();
    this.roar = { filter: rf, gain: rg, rumble: rb, rumbleGain: rbg };
  }

  /** Servo whine while transforming: level 0 … 1, rate in progress units per second. */
  setServo(level: number, rate: number): void {
    this.stats.servo = level;
    const s = this.servo;
    if (!this.ctx || !s) return;
    const t = this.ctx.currentTime;
    const f = 120 + 150 * Math.min(1, Math.abs(rate) / 0.34) + 18 * Math.sin(t * 6.3);
    s.gain.gain.setTargetAtTime(level * 0.07, t, 0.05);
    s.a.frequency.setTargetAtTime(f, t, 0.08);
    s.b.frequency.setTargetAtTime(f * 1.5, t, 0.08);
    s.filter.frequency.setTargetAtTime(f * 3.2, t, 0.1);
  }

  /** Engines: spool 0 … 1 (whine pitch), roar 0 … 1 (exhaust loudness), overboost 0 … 1 (rumble). */
  setEngines(spool: number, roar: number, overboost: number): void {
    this.stats.turbine = spool;
    this.stats.roar = roar;
    const tu = this.turbine;
    const ro = this.roar;
    if (!this.ctx || !tu || !ro) return;
    const t = this.ctx.currentTime;
    const f = 180 + 950 * spool;
    tu.a.frequency.setTargetAtTime(f, t, 0.25);
    tu.b.frequency.setTargetAtTime(f * 1.5, t, 0.25);
    tu.gain.gain.setTargetAtTime(roar > 0 ? 0.012 + 0.03 * spool : 0, t, 0.2);
    ro.filter.frequency.setTargetAtTime(350 + 2800 * spool, t, 0.25);
    ro.gain.gain.setTargetAtTime(0.22 * roar, t, 0.2);
    ro.rumbleGain.gain.setTargetAtTime(0.45 * overboost, t, 0.15);
  }

  /** A band-passed slice of noise with a fast attack and exponential decay. */
  private burst(dur: number, freq: number, q: number, gain: number, sweepTo?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /** A pitched body thud: a sine falling from f0 to f1. */
  private thud(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private ready(): boolean {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return false;
    this.stats.oneShots++;
    return true;
  }

  /** An assembly locking home. */
  clunk(size = 1): void {
    if (!this.ready()) return;
    this.thud(130, 55, 0.16, 0.3 * size);
    this.burst(0.07, 1900, 3, 0.2 * size);
    this.thud(980, 900, 0.12, 0.035 * size, 'triangle');
  }

  /** A 12 m robot's footfall. */
  footstep(weight = 1): void {
    if (!this.ready()) return;
    this.thud(78, 30, 0.34, 0.55 * weight);
    this.burst(0.14, 260, 0.9, 0.22 * weight);
    this.thud(640, 600, 0.18, 0.03 * weight, 'triangle');
  }

  /** Touchdown after a jump. */
  thump(size = 1): void {
    if (!this.ready()) return;
    this.thud(62, 24, 0.55, 0.85 * size);
    this.burst(0.32, 180, 0.7, 0.45 * size);
  }

  /** Vernier blast of a jump. */
  blast(): void {
    if (!this.ready()) return;
    this.burst(0.7, 380, 1.2, 0.5, 2600);
  }

  /** Soft UI tick. */
  tick(): void {
    if (!this.ready()) return;
    this.thud(1800, 1700, 0.03, 0.04, 'sine');
  }
}

export const sound = new SoundEngine();
