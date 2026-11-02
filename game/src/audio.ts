// Procedural WebAudio — every sound synthesized, zero assets.
// Created/resumed on the DESCEND click (browser autoplay policy).

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: OscillatorNode[] = [];
  private noiseBuf: AudioBuffer | null = null;
  private whisperBufs: Record<'far' | 'near', AudioBuffer | null> = { far: null, near: null };
  private chadBufs: Record<'greet' | 'deal' | 'mock' | 'enrage', AudioBuffer | null> = {
    greet: null,
    deal: null,
    mock: null,
    enrage: null,
  };
  private musicBus: GainNode | null = null;
  private musicTimer: number | null = null;
  private fireNodes: { src: AudioBufferSourceNode; timer: number } | null = null;

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
      // Preload the spoken whisper lines (served from /audio/). Fire-and-forget:
      // if a file fails, whisper() falls back to the procedural bed alone.
      (['far', 'near'] as const).forEach((kind) => {
        fetch(new URL(`audio/whisper-${kind}.mp3`, document.baseURI).toString())
          .then((r) => { if (!r.ok) throw new Error(`whisper ${kind}: ${r.status}`); return r.arrayBuffer(); })
          .then((ab) => this.ctx!.decodeAudioData(ab))
          .then((buf) => { this.whisperBufs[kind] = buf; })
          .catch((e) => console.warn('[audio] whisper preload failed:', e));
      });
      // Preload Chad's voiced dialogue lines. Same fire-and-forget pattern.
      (['greet', 'deal', 'mock', 'enrage'] as const).forEach((kind) => {
        fetch(new URL(`audio/chad-${kind}.mp3`, document.baseURI).toString())
          .then((r) => { if (!r.ok) throw new Error(`chad ${kind}: ${r.status}`); return r.arrayBuffer(); })
          .then((ab) => this.ctx!.decodeAudioData(ab))
          .then((buf) => { this.chadBufs[kind] = buf; })
          .catch((e) => console.warn('[audio] chad preload failed:', e));
      });
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

  /** Spoken exit whisper: the AI-voiced line over a breathy procedural bed.
   *  'far' = faint tier (<=9 cells), 'near' = close tier (<=4). If the voice
   *  file hasn't loaded yet, the bed plays alone. */
  whisper(kind: 'far' | 'near') {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const buf = this.whisperBufs[kind];
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // Slightly slowed + darkened: more whisper, less announcement.
      src.playbackRate.value = 0.92 + Math.random() * 0.06;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.value = kind === 'near' ? 0.9 : 0.6;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      src.connect(lp).connect(g).connect(pan).connect(this.master!);
      src.start(ctx.currentTime);
    }
    this.whisperBed(kind === 'near' ? 1.6 : 1);
  }

  /** Chad's voiced dialogue line. If the file hasn't loaded, the text still shows. */
  chadVoice(kind: 'greet' | 'deal' | 'mock' | 'enrage') {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const buf = this.chadBufs[kind];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(g).connect(this.master!);
    src.start(ctx.currentTime);
  }

  /** Wordless breathy bed under the spoken line (also the no-file fallback).
   *  intensity 1 = faint, ~2 = close. No words: shaped noise through
   *  voice-like formant bands, drifting around the listener's head. */
  private whisperBed(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 3.0;
    const peak = 0.1 * Math.min(2.2, Math.max(0.5, intensity));

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const wgain = ctx.createGain();
    wgain.gain.setValueAtTime(0.0001, t);
    wgain.gain.linearRampToValueAtTime(peak, t + 0.9);
    wgain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // Breathiness: slow tremolo on the whisper gain.
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.2 + Math.random();
    const tremG = ctx.createGain();
    tremG.gain.value = peak * 0.45;
    trem.connect(tremG).connect(wgain.gain);

    // Drift around the head.
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    const panLfo = ctx.createOscillator();
    panLfo.frequency.value = 0.33;
    const panG = ctx.createGain();
    panG.gain.value = 0.65;
    panLfo.connect(panG).connect(pan.pan);

    // Two formant-ish bands: a voice with no words.
    for (const [freq, q, g] of [[1050, 1.4, 1.0], [2500, 2.2, 0.45]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      src.connect(bp).connect(gg).connect(wgain);
    }

    wgain.connect(pan).connect(this.master!);
    src.start(t);
    trem.start(t);
    panLfo.start(t);
    const stopAt = t + dur + 0.1;
    src.stop(stopAt);
    trem.stop(stopAt);
    panLfo.stop(stopAt);
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

  // ---- generative music ----

  /** Dark ambient in D natural minor: sparse singing-bowl bells through a
   *  spacious feedback delay, with an occasional deep pulse. Generative —
   *  no two descents sound the same. Sits under the SFX. */
  startMusic() {
    if (!this.ready || this.musicTimer !== null) return;
    const ctx = this.ctx!;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    // Spacious dungeon: feedback delay on the music bus.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.musicBus.connect(this.master!);
    this.musicBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.master!);
    this.scheduleNote();
  }

  private scheduleNote() {
    if (!this.ready || !this.musicBus) return;
    // D natural minor, weighted toward tonic + fifth + fourth.
    const scale = [146.83, 164.81, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66];
    const weights = [3, 1, 2, 2, 3, 1, 2, 1];
    let total = 0;
    for (const w of weights) total += w;
    let r = Math.random() * total;
    let freq = scale[0];
    for (let i = 0; i < scale.length; i++) {
      r -= weights[i];
      if (r <= 0) { freq = scale[i]; break; }
    }
    this.bell(freq);
    // Sometimes answer the bell with a deep pulse.
    if (Math.random() < 0.3) this.drum();
    // Rarely, two bells close together — a phrase.
    if (Math.random() < 0.25) {
      const second = scale[Math.floor(Math.random() * scale.length)];
      window.setTimeout(() => this.bell(second), 1400 + Math.random() * 1200);
    }
    const next = 4000 + Math.random() * 6000;
    this.musicTimer = window.setTimeout(() => this.scheduleNote(), next);
  }

  /** Singing-bowl bell: sine + inharmonic partials, slow bloom, long decay. */
  private bell(freq: number) {
    if (!this.ready || !this.musicBus) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    const partials: Array<[number, number]> = [[1, 1], [2.76, 0.32], [5.4, 0.1]];
    for (const [mult, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult * (1 + (Math.random() - 0.5) * 0.002);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 5.2);
    }
    g.connect(this.musicBus);
  }

  /** Deep pulse under the bells — the god's heartbeat, maybe. */
  private drum() {
    if (!this.ready || !this.musicBus) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 1.3);
  }

  // ---- fireplace ----

  /** Looping fire rumble + random crackle pops. Idempotent; call when near
   *  the study, stopFire() when leaving. */
  startFire() {
    if (!this.ready || this.fireNodes) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    const pop = () => {
      if (!this.fireNodes) return; // stopped mid-flight
      this.noise(0.05 + Math.random() * 0.09, 900 + Math.random() * 1800, 'bandpass', 0.08 + Math.random() * 0.1);
      // Occasional double-crack.
      if (Math.random() < 0.3)
        this.noise(0.04, 1400 + Math.random() * 1200, 'bandpass', 0.07, 0.07);
      this.fireNodes.timer = window.setTimeout(pop, 140 + Math.random() * 750);
    };
    const timer = window.setTimeout(pop, 250);
    this.fireNodes = { src, timer };
  }

  stopFire() {
    if (!this.fireNodes) return;
    clearTimeout(this.fireNodes.timer);
    try {
      this.fireNodes.src.stop();
    } catch {
      /* already stopped */
    }
    this.fireNodes = null;
  }
}
