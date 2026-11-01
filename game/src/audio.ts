// Procedural WebAudio — every sound synthesized, zero assets.
// Created/resumed on the DESCEND click (browser autoplay policy).

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: OscillatorNode[] = [];
  private noiseBuf: AudioBuffer | null = null;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // Shared noise buffer (2s white noise).
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private get ready(): boolean {
    return !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  /** Filtered noise burst. */
  private noise(dur: number, filterFreq: number, type: BiquadFilterType, gain: number, when = 0, slideTo?: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (slideTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Simple oscillator blip with pitch envelope. */
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- game sounds ----

  footstep() {
    this.noise(0.09, 300 + Math.random() * 200, 'lowpass', 0.25);
  }

  swing() {
    this.noise(0.18, 1800, 'bandpass', 0.3, 0, 400);
  }

  hitFlesh() {
    this.noise(0.12, 500, 'lowpass', 0.5);
    this.tone(120, 0.12, 'sine', 0.4, 0, 60);
  }

  bite() {
    // wet crunch: noise snap + low thump
    this.noise(0.08, 2500, 'highpass', 0.35);
    this.tone(90, 0.15, 'triangle', 0.5, 0.02, 45);
  }

  hurt() {
    this.tone(220, 0.25, 'sawtooth', 0.25, 0, 110);
  }

  /** Gibberling growl — volume 0..1 by proximity. */
  growl(volume = 0.5) {
    const v = Math.max(0.05, Math.min(1, volume));
    // guttural: low sawtooth wobble + breath noise
    this.tone(65 + Math.random() * 20, 0.7, 'sawtooth', 0.35 * v, 0, 50);
    this.tone(98, 0.7, 'square', 0.12 * v, 0.05, 70);
    this.noise(0.6, 400, 'lowpass', 0.2 * v);
  }

  search() {
    this.noise(0.25, 3000, 'highpass', 0.15);
    this.noise(0.2, 1200, 'bandpass', 0.12, 0.08);
  }

  find() {
    // small chime: two sine pings
    this.tone(660, 0.15, 'sine', 0.2);
    this.tone(990, 0.25, 'sine', 0.2, 0.09);
  }

  trap() {
    this.tone(1800, 0.08, 'square', 0.2, 0, 900);
    this.noise(0.15, 4000, 'highpass', 0.25, 0.02);
  }

  descend() {
    // deep rising drone into the next depth
    this.tone(55, 1.6, 'sine', 0.4, 0, 110);
    this.tone(82, 1.6, 'triangle', 0.2, 0.1, 165);
    this.noise(1.2, 300, 'lowpass', 0.25, 0.1, 1200);
  }

  death() {
    this.tone(330, 1.2, 'sawtooth', 0.3, 0, 55);
    this.tone(165, 1.4, 'triangle', 0.3, 0.15, 40);
    this.noise(1.0, 800, 'lowpass', 0.3, 0.2, 100);
  }

  startAmbient() {
    if (!this.ready || this.ambientNodes.length) return;
    const ctx = this.ctx!;
    // Low uneasy drone: two detuned sines + slow LFO on gain.
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    for (const freq of [48, 48.7, 96.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      o.start();
      this.ambientNodes.push(o);
    }
    g.connect(this.master!);
    lfo.start();
    this.ambientNodes.push(lfo);
  }
}
