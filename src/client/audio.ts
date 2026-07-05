/**
 * src/client/audio.ts
 * -------------------
 * Procedural audio for Ashfall — no sound files, everything synthesised from
 * oscillators + noise. The synthesis core (noise buffer, reverb impulse, the
 * `tone`/`note`/`noise` voices, `noiseBed`, `drone`, the autoplay-unlock and
 * bus graph) is lifted from the sibling `world` project's engine; the sound
 * *vocabulary* is rewritten for horror: low dissonant drones, wet impacts,
 * gunfire, wind, and the wet-throat voices of the infected.
 *
 * Nothing here throws into the frame loop — every synth body is wrapped so a
 * WebAudio hiccup can never break rendering.
 */

export type Sfx =
  | "melee" | "hit" | "crit" | "bowshot" | "dryfire" | "throw" | "explode"
  | "pickup" | "craft" | "build" | "recruit" | "gather" | "heal" | "eat"
  | "drink" | "search" | "equip" | "click" | "hurt" | "death"
  | "nightfall" | "daybreak" | "lowhp" | "levelup" | "dodge";

export type CreatureVoice = "risen" | "hound" | "wretch" | "revenant" | "graveking" | "prior" | "rotmother";
export type SceneKey = "menu" | "day" | "night" | "woods" | "abbey" | "mire" | "barrows" | "heart";

const VOL_KEY = "ashfall-vol";
const MUTE_KEY = "ashfall-mute";
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface ToneOpts {
  f0: number; f1?: number; type?: OscillatorType; dur: number; peak: number;
  lp?: number; wet?: boolean; delay?: number; bus?: AudioNode;
}
interface NoiseOpts { dur: number; peak: number; lp?: number; hp?: number; wet?: boolean; delay?: number; bus?: AudioNode; }

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private musBus: GainNode | null = null;
  private reverbIn: ConvolverNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private unlocked = false;
  private volume = 0.7;
  private muted = false;
  private scene: SceneKey | null = null;
  private sceneNodes: AudioNode[] = [];
  private sceneTimers: number[] = [];
  private tensionUntil = 0;
  private bossOn = false;
  private bossTimer = 0;

  constructor() {
    if (typeof window === "undefined") return;
    this.volume = this.readVol();
    this.muted = this.readMute();
    const onGesture = () => this.unlock();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchstart", onGesture);
  }

  private readVol(): number {
    try { const v = localStorage.getItem(VOL_KEY); return v == null ? 0.7 : clamp01(parseFloat(v)); } catch { return 0.7; }
  }
  private readMute(): boolean {
    try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
  }

  isUnlocked(): boolean { return this.unlocked; }
  getVolume(): number { return this.volume; }
  setVolume(v: number): void {
    this.volume = clamp01(v);
    try { localStorage.setItem(VOL_KEY, String(this.volume)); } catch { /* ignore */ }
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }
  getMuted(): boolean { return this.muted; }
  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  unlock(): void {
    try {
      if (!this.ctx) this.init();
      if (this.ctx?.state === "suspended") void this.ctx.resume();
      if (!this.unlocked) {
        this.unlocked = true;
        if (this.scene) this.buildScene(this.scene);
      }
      window.removeEventListener("pointerdown", this.unlock);
    } catch { /* ignore */ }
  }

  private init(): void {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.24;
    master.connect(comp); comp.connect(ctx.destination);
    this.master = master;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(3.4, 3.0); // long, cold, cavernous
    const wet = ctx.createGain(); wet.gain.value = 0.7;
    reverb.connect(wet); wet.connect(master);
    this.reverbIn = reverb;

    const mk = (v: number) => { const g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; };
    this.sfxBus = mk(1.0);
    this.ambBus = mk(0.75);
    this.musBus = mk(1.2);
    this.noiseBuf = this.makeNoise(2.5);
  }

  private makeNoise(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
    return buf;
  }
  private makeImpulse(sec: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let s = 987654 + c * 13;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (s / 0x3fffffff - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    let node: AudioNode = osc;
    if (o.lp != null) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; osc.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    g.connect(o.bus ?? this.sfxBus ?? this.master!);
    if (o.wet && this.reverbIn) g.connect(this.reverbIn);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  private note(o: { f: number; type?: OscillatorType; dur: number; peak: number; delay?: number; attack?: number; wet?: boolean; bus?: AudioNode }): void {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.value = o.f;
    const g = ctx.createGain();
    const atk = o.attack ?? 0.04;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g);
    g.connect(o.bus ?? this.musBus ?? this.master!);
    if (o.wet !== false && this.reverbIn) g.connect(this.reverbIn);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx; if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    let node: AudioNode = src;
    if (o.hp != null) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = o.hp; node.connect(f); node = f; }
    if (o.lp != null) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lp; node.connect(f); node = f; }
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    node.connect(g);
    g.connect(o.bus ?? this.sfxBus ?? this.master!);
    if (o.wet && this.reverbIn) g.connect(this.reverbIn);
    src.start(t); src.stop(t + o.dur + 0.05);
  }

  /** A sustained, filtered noise bed (wind, room tone) with optional LFO. */
  private noiseBed(peak: number, lp: number, hp: number | null, lfo?: { rate: number; depth: number; target: "gain" | "lp" }): AudioNode[] {
    const ctx = this.ctx; if (!ctx || !this.noiseBuf || !this.ambBus) return [];
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    let node: AudioNode = src;
    if (hp != null) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; node.connect(f); node = f; }
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = lp; node.connect(filt);
    const g = ctx.createGain(); g.gain.value = 0.0001;
    filt.connect(g); g.connect(this.ambBus);
    g.gain.linearRampToValueAtTime(peak, ctx.currentTime + 2.5);
    const made: AudioNode[] = [src, filt, g];
    if (lfo) {
      const osc = ctx.createOscillator(); osc.frequency.value = lfo.rate;
      const amp = ctx.createGain(); amp.gain.value = lfo.depth;
      osc.connect(amp);
      if (lfo.target === "gain") amp.connect(g.gain); else amp.connect(filt.frequency);
      osc.start(); made.push(osc, amp);
    }
    src.start();
    return made;
  }

  /** A sustained tonal drone (the dread floor). */
  private drone(freq: number, peak: number, type: OscillatorType = "sawtooth"): AudioNode[] {
    const ctx = this.ctx; if (!ctx || !this.ambBus) return [];
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    osc.connect(lp); lp.connect(g); g.connect(this.ambBus);
    g.gain.linearRampToValueAtTime(peak, ctx.currentTime + 4);
    osc.start();
    return [osc, lp, g];
  }

  // --- Public triggers ---------------------------------------------------

  play(id: Sfx): void {
    if (!this.unlocked || this.muted || !this.ctx) return;
    try {
      switch (id) {
        case "melee": // whoosh
          this.noise({ dur: 0.16, peak: 0.14, hp: 500, lp: 3200 });
          this.tone({ f0: 220, f1: 90, dur: 0.14, peak: 0.1, type: "sawtooth", lp: 900 });
          break;
        case "hit": // wet thud on flesh
          this.noise({ dur: 0.12, peak: 0.4, lp: 900 });
          this.tone({ f0: 120, f1: 50, dur: 0.14, peak: 0.34, type: "sine" });
          this.noise({ dur: 0.06, peak: 0.2, hp: 1200, lp: 4000, delay: 0.01 });
          break;
        case "crit":
          this.noise({ dur: 0.2, peak: 0.5, lp: 1200 });
          this.tone({ f0: 160, f1: 40, dur: 0.22, peak: 0.4, type: "square", lp: 700 });
          this.tone({ f0: 900, f1: 300, dur: 0.1, peak: 0.18, type: "triangle", delay: 0.01 });
          break;
        case "bowshot":
          this.tone({ f0: 240, f1: 120, dur: 0.06, peak: 0.2, type: "triangle" }); // string release
          this.noise({ dur: 0.22, peak: 0.16, hp: 900, lp: 5000 }); // arrow whoosh
          break;
        case "dryfire":
          this.tone({ f0: 1200, f1: 900, dur: 0.04, peak: 0.12, type: "square" });
          this.noise({ dur: 0.04, peak: 0.08, hp: 3000 });
          break;
        case "build":
          this.noise({ dur: 0.1, peak: 0.24, hp: 1200, lp: 6000 });
          this.tone({ f0: 240, f1: 200, dur: 0.16, peak: 0.2, type: "triangle", delay: 0.02, wet: true });
          this.tone({ f0: 200, f1: 170, dur: 0.2, peak: 0.18, type: "triangle", delay: 0.16, wet: true });
          break;
        case "recruit":
          this.note({ f: 262, dur: 0.5, peak: 0.14, type: "triangle", attack: 0.02, wet: true });
          this.note({ f: 392, dur: 0.6, peak: 0.13, type: "triangle", attack: 0.03, wet: true, delay: 0.12 });
          break;
        case "levelup": // a rising three-note fanfare
          this.note({ f: 261.63, dur: 0.5, peak: 0.16, type: "triangle", attack: 0.01, wet: true });
          this.note({ f: 329.63, dur: 0.5, peak: 0.16, type: "triangle", attack: 0.01, wet: true, delay: 0.12 });
          this.note({ f: 392, dur: 0.7, peak: 0.18, type: "triangle", attack: 0.01, wet: true, delay: 0.24 });
          this.note({ f: 523.25, dur: 0.8, peak: 0.16, type: "sine", attack: 0.02, wet: true, delay: 0.24 });
          break;
        case "gather":
          this.noise({ dur: 0.18, peak: 0.2, hp: 300, lp: 2400 });
          this.tone({ f0: 180, f1: 120, dur: 0.14, peak: 0.14, type: "sine" });
          break;
        case "dodge": // a quick cloth-and-air whoosh
          this.noise({ dur: 0.22, peak: 0.18, hp: 900, lp: 5000 });
          this.tone({ f0: 360, f1: 150, dur: 0.18, peak: 0.08, type: "sine" });
          break;
        case "throw":
          this.noise({ dur: 0.22, peak: 0.14, hp: 700, lp: 3000 });
          break;
        case "explode":
          this.noise({ dur: 0.7, peak: 0.8, lp: 1600, wet: true });
          this.tone({ f0: 160, f1: 30, dur: 0.6, peak: 0.5, type: "sawtooth", lp: 500 });
          this.noise({ dur: 0.9, peak: 0.3, hp: 1200, lp: 6000, delay: 0.02 });
          break;
        case "pickup":
          this.tone({ f0: 520, f1: 640, dur: 0.08, peak: 0.14, type: "triangle" });
          break;
        case "craft":
          this.noise({ dur: 0.1, peak: 0.2, hp: 1500, lp: 6000 });
          this.tone({ f0: 300, f1: 500, dur: 0.16, peak: 0.16, type: "triangle", delay: 0.05 });
          this.tone({ f0: 500, f1: 720, dur: 0.14, peak: 0.14, type: "triangle", delay: 0.14 });
          break;
        case "heal":
          this.note({ f: 300, dur: 0.5, peak: 0.12, type: "sine", attack: 0.05, wet: true });
          this.note({ f: 400, dur: 0.5, peak: 0.1, type: "sine", attack: 0.08, wet: true, delay: 0.06 });
          break;
        case "eat":
          this.noise({ dur: 0.18, peak: 0.16, lp: 1400 });
          this.noise({ dur: 0.16, peak: 0.14, lp: 1400, delay: 0.2 });
          break;
        case "drink":
          this.tone({ f0: 700, f1: 500, dur: 0.1, peak: 0.1, type: "sine" });
          this.tone({ f0: 620, f1: 440, dur: 0.1, peak: 0.1, type: "sine", delay: 0.14 });
          break;
        case "search":
          this.noise({ dur: 0.3, peak: 0.14, hp: 400, lp: 2600 });
          break;
        case "equip":
          this.tone({ f0: 260, f1: 180, dur: 0.1, peak: 0.16, type: "square", lp: 1400 });
          this.noise({ dur: 0.06, peak: 0.12, hp: 2000, delay: 0.04 });
          break;
        case "click":
          this.tone({ f0: 900, dur: 0.03, peak: 0.08, type: "square" });
          break;
        case "hurt":
          this.tone({ f0: 200, f1: 110, dur: 0.24, peak: 0.3, type: "sawtooth", lp: 800 });
          this.noise({ dur: 0.12, peak: 0.18, lp: 1200 });
          break;
        case "death":
          this.tone({ f0: 140, f1: 34, dur: 2.4, peak: 0.4, type: "sawtooth", lp: 400, wet: true });
          this.tone({ f0: 210, f1: 50, dur: 2.0, peak: 0.2, type: "sine", wet: true, delay: 0.1 });
          break;
        case "nightfall":
          this.note({ f: 55, dur: 3.5, peak: 0.4, type: "sawtooth", attack: 0.6, wet: true });
          this.note({ f: 58.27, dur: 3.5, peak: 0.3, type: "sine", attack: 0.8, wet: true });
          break;
        case "daybreak":
          this.note({ f: 220, dur: 2.6, peak: 0.16, type: "triangle", attack: 0.7, wet: true });
          this.note({ f: 329.63, dur: 2.6, peak: 0.12, type: "triangle", attack: 1.0, wet: true, delay: 0.3 });
          break;
        case "lowhp":
          // heartbeat double-thump
          this.tone({ f0: 70, f1: 45, dur: 0.14, peak: 0.4, type: "sine" });
          this.tone({ f0: 66, f1: 42, dur: 0.16, peak: 0.34, type: "sine", delay: 0.16 });
          break;
      }
    } catch { /* never let audio break the frame */ }
  }

  creature(v: CreatureVoice, kind: "aggro" | "attack" | "die"): void {
    if (!this.unlocked || this.muted || !this.ctx) return;
    try {
      const growl = (f0: number, f1: number, dur: number, peak: number) => {
        this.tone({ f0, f1, dur, peak, type: "sawtooth", lp: 700, wet: true });
        this.noise({ dur: dur * 0.8, peak: peak * 0.5, lp: 1400, hp: 200 });
      };
      switch (v) {
        case "risen": // a wet, dragging moan
          if (kind === "aggro") growl(140, 85, 0.8, 0.22);
          else if (kind === "attack") growl(170, 65, 0.3, 0.24);
          else growl(110, 28, 1.1, 0.26);
          break;
        case "hound": // a rabid snarl / bark
          if (kind === "aggro") { this.tone({ f0: 520, f1: 820, dur: 0.35, peak: 0.24, type: "sawtooth", lp: 2200, wet: true }); this.noise({ dur: 0.35, peak: 0.2, hp: 600, lp: 3000 }); }
          else if (kind === "attack") this.tone({ f0: 700, f1: 360, dur: 0.18, peak: 0.24, type: "square", lp: 1900 });
          else this.tone({ f0: 620, f1: 110, dur: 0.55, peak: 0.24, type: "sawtooth", lp: 1700, wet: true });
          break;
        case "wretch": // bloated, phlegmy
          if (kind === "aggro") { growl(90, 60, 1.0, 0.3); this.noise({ dur: 0.5, peak: 0.16, lp: 900 }); }
          else if (kind === "attack") { this.noise({ dur: 0.3, peak: 0.4, lp: 800 }); growl(110, 50, 0.4, 0.3); }
          else growl(80, 24, 1.4, 0.32);
          break;
        case "revenant": // armoured knight — low dread + steel
          if (kind === "aggro") { growl(64, 46, 1.4, 0.4); this.tone({ f0: 44, dur: 1.4, peak: 0.3, type: "sine", wet: true }); }
          else if (kind === "attack") { this.noise({ dur: 0.14, peak: 0.4, hp: 2000, lp: 8000 }); growl(90, 40, 0.5, 0.36); }
          else { this.tone({ f0: 58, f1: 22, dur: 2.2, peak: 0.4, type: "sawtooth", lp: 360, wet: true }); this.tone({ f0: 620, f1: 200, dur: 0.5, peak: 0.14, type: "triangle", wet: true, delay: 0.1 }); }
          break;
        case "graveking": // the boss — a vast tolling dread
          if (kind === "aggro") { this.tone({ f0: 41, dur: 2.2, peak: 0.5, type: "sawtooth", lp: 300, wet: true }); this.tone({ f0: 61.74, dur: 2.2, peak: 0.34, type: "sawtooth", lp: 340, wet: true }); this.tone({ f0: 33, dur: 2.4, peak: 0.4, type: "sine", wet: true, delay: 0.05 }); }
          else if (kind === "attack") { this.noise({ dur: 0.3, peak: 0.6, lp: 900 }); this.tone({ f0: 70, f1: 30, dur: 0.5, peak: 0.5, type: "sawtooth", lp: 500, wet: true }); }
          else { this.tone({ f0: 48, f1: 18, dur: 3, peak: 0.5, type: "sawtooth", lp: 320, wet: true }); this.tone({ f0: 220, f1: 60, dur: 1.6, peak: 0.2, type: "triangle", wet: true, delay: 0.2 }); }
          break;
        case "prior": // the abbey boss — a dissonant plainchant wail
          if (kind === "aggro") { this.note({ f: 146.83, dur: 2, peak: 0.34, type: "sawtooth", attack: 0.2, wet: true }); this.note({ f: 155.56, dur: 2, peak: 0.26, type: "sawtooth", attack: 0.25, wet: true }); this.tone({ f0: 73, dur: 2, peak: 0.3, type: "sine", wet: true }); }
          else if (kind === "attack") { this.tone({ f0: 440, f1: 160, dur: 0.3, peak: 0.3, type: "sawtooth", lp: 2200, wet: true }); this.noise({ dur: 0.2, peak: 0.3, lp: 1400 }); }
          else { this.note({ f: 196, dur: 2.4, peak: 0.3, type: "sawtooth", attack: 0.3, wet: true }); this.tone({ f0: 98, f1: 40, dur: 2.4, peak: 0.3, type: "sine", wet: true, delay: 0.1 }); }
          break;
        case "rotmother": // the final boss — a vast, wet, subsonic bellow
          if (kind === "aggro") { this.tone({ f0: 32, dur: 2.8, peak: 0.5, type: "sine", wet: true }); this.tone({ f0: 43, f1: 38, dur: 2.6, peak: 0.4, type: "sawtooth", lp: 260, wet: true }); this.noise({ dur: 1.4, peak: 0.24, lp: 500 }); }
          else if (kind === "attack") { this.noise({ dur: 0.5, peak: 0.6, lp: 700 }); this.tone({ f0: 80, f1: 28, dur: 0.7, peak: 0.5, type: "sawtooth", lp: 400, wet: true }); }
          else { this.tone({ f0: 44, f1: 16, dur: 3.4, peak: 0.55, type: "sawtooth", lp: 300, wet: true }); this.noise({ dur: 2.2, peak: 0.3, lp: 600, wet: true, delay: 0.2 }); }
          break;
      }
    } catch { /* ignore */ }
  }

  /** Combat tension sting when something wakes and comes for you. */
  sting(): void {
    if (!this.unlocked || this.muted || !this.ctx || this.ctx.currentTime < this.tensionUntil) return;
    this.tensionUntil = this.ctx.currentTime + 2.5;
    try {
      this.note({ f: 110, dur: 1.6, peak: 0.34, type: "sawtooth", attack: 0.01, wet: true });
      this.note({ f: 116.54, dur: 1.6, peak: 0.28, type: "sawtooth", attack: 0.01, wet: true }); // minor 2nd cluster
      this.note({ f: 220, dur: 0.8, peak: 0.18, type: "square", attack: 0.005, wet: true, delay: 0.02 });
    } catch { /* ignore */ }
  }

  // --- Ambient soundscape ------------------------------------------------

  setScene(key: SceneKey): void {
    if (this.scene === key) return;
    this.scene = key;
    if (this.unlocked) this.buildScene(key);
  }

  private clearScene(): void {
    const ctx = this.ctx;
    for (const t of this.sceneTimers) clearTimeout(t);
    this.sceneTimers = [];
    for (const n of this.sceneNodes) {
      try {
        if (n instanceof GainNode && ctx) { n.gain.cancelScheduledValues(ctx.currentTime); n.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.4); }
        else if ("stop" in n && typeof (n as OscillatorNode).stop === "function") setTimeout(() => { try { (n as OscillatorNode).stop(); } catch { /* */ } }, 1600);
      } catch { /* ignore */ }
    }
    this.sceneNodes = [];
  }

  private every(minMs: number, maxMs: number, fire: () => void): void {
    const arm = () => {
      const id = window.setTimeout(() => { try { fire(); } catch { /* */ } arm(); }, minMs + Math.random() * (maxMs - minMs));
      this.sceneTimers.push(id);
    };
    arm();
  }

  private buildScene(key: SceneKey): void {
    if (!this.ctx) return;
    this.clearScene();
    if (key === "menu") {
      this.sceneNodes.push(...this.drone(48, 0.22, "sawtooth"));
      this.sceneNodes.push(...this.drone(72, 0.14, "sine"));
      this.sceneNodes.push(...this.noiseBed(0.05, 700, 200, { rate: 0.08, depth: 400, target: "lp" }));
      this.every(9000, 16000, () => this.note({ f: 55, dur: 4, peak: 0.16, type: "sawtooth", attack: 1.2, wet: true }));
      return;
    }
    if (key === "woods") {
      // Airy wind through timber; birds and rustling leaves.
      this.sceneNodes.push(...this.noiseBed(0.11, 2200, 500, { rate: 0.16, depth: 900, target: "lp" }));
      this.sceneNodes.push(...this.drone(58, 0.08, "sine"));
      this.every(5000, 12000, () => { for (let i = 0; i < 3; i++) this.tone({ f0: 1600 + Math.random() * 800, f1: 1400, dur: 0.08, peak: 0.04, type: "sine", wet: true, delay: i * 0.12 }); });
      this.every(7000, 15000, () => this.noise({ dur: 0.5, peak: 0.06, hp: 1500, lp: 6000 })); // rustle
      return;
    }
    if (key === "abbey") {
      // Cold stone: a reverberant drone and a distant, cracked bell.
      this.sceneNodes.push(...this.drone(49, 0.22, "sawtooth"));
      this.sceneNodes.push(...this.drone(65.4, 0.12, "sine"));
      this.sceneNodes.push(...this.noiseBed(0.05, 600, 150, { rate: 0.06, depth: 300, target: "lp" }));
      this.every(10000, 20000, () => { this.tone({ f0: 155, f1: 150, dur: 3, peak: 0.08, type: "triangle", wet: true }); this.tone({ f0: 233, f1: 226, dur: 3, peak: 0.05, type: "sine", wet: true }); });
      return;
    }
    if (key === "mire") {
      // Sodden murk: drips, bubbles, a low wet drone and frogs.
      this.sceneNodes.push(...this.drone(43, 0.18, "sine"));
      this.sceneNodes.push(...this.noiseBed(0.06, 500, null, { rate: 0.1, depth: 200, target: "lp" }));
      this.every(2500, 6000, () => this.tone({ f0: 1200 + Math.random() * 700, f1: 400, dur: 0.14, peak: 0.06, type: "sine", wet: true })); // drip
      this.every(4000, 9000, () => this.tone({ f0: 90 + Math.random() * 30, f1: 70, dur: 0.3, peak: 0.06, type: "sawtooth", lp: 500 })); // frog / bubble
      return;
    }
    if (key === "barrows") {
      // Deep cavern: a very low drone, metal creaks and a distant knell.
      this.sceneNodes.push(...this.drone(36, 0.28, "sawtooth"));
      this.sceneNodes.push(...this.drone(38, 0.16, "sawtooth"));
      this.every(8000, 16000, () => this.tone({ f0: 260 + Math.random() * 120, f1: 240, dur: 1.6, peak: 0.06, type: "sawtooth", lp: 1200, wet: true })); // metal creak
      this.every(12000, 24000, () => this.tone({ f0: 82, f1: 78, dur: 2.4, peak: 0.09, type: "sine", wet: true })); // knell
      return;
    }
    if (key === "heart") {
      // The source of the rot: an oppressive subsonic throb and wet groans.
      this.sceneNodes.push(...this.drone(30, 0.34, "sine"));
      this.sceneNodes.push(...this.drone(41, 0.16, "sawtooth"));
      this.sceneNodes.push(...this.noiseBed(0.07, 500, null, { rate: 0.5, depth: 250, target: "gain" }));
      this.every(4000, 9000, () => this.tone({ f0: 120 + Math.random() * 40, f1: 50, dur: 1.6, peak: 0.08, type: "sawtooth", lp: 700, wet: true }));
      return;
    }
    // Home: wind bed shared by day + night.
    this.sceneNodes.push(...this.noiseBed(0.09, 900, 300, { rate: 0.12, depth: 500, target: "lp" }));
    if (key === "day") {
      this.sceneNodes.push(...this.drone(52, 0.1, "sine"));
      this.every(14000, 26000, () => this.tone({ f0: 300 + Math.random() * 200, f1: 260, dur: 1.2, peak: 0.05, type: "sawtooth", lp: 1400, wet: true }));
      this.every(20000, 40000, () => { for (let i = 0; i < 2; i++) this.tone({ f0: 900, f1: 700, dur: 0.14, peak: 0.05, type: "sawtooth", lp: 2600, wet: true, delay: i * 0.2 }); });
    } else {
      this.sceneNodes.push(...this.drone(41, 0.26, "sawtooth"));
      this.sceneNodes.push(...this.drone(43.5, 0.16, "sawtooth"));
      this.every(6000, 13000, () => this.tone({ f0: 130 + Math.random() * 40, f1: 70, dur: 1.4, peak: 0.06, type: "sawtooth", lp: 800, wet: true }));
      this.every(3000, 8000, () => this.tone({ f0: 1400 + Math.random() * 600, f1: 500, dur: 0.12, peak: 0.05, type: "sine", wet: true }));
    }
  }

  /** A driving battle motif while a boss hunts you: war-drum + tritone drone. */
  setBossMusic(on: boolean): void {
    if (on === this.bossOn) return;
    if (on && (!this.unlocked || this.muted || !this.ctx)) return;
    this.bossOn = on;
    if (on) this.scheduleBossLoop();
    else if (this.bossTimer) { clearTimeout(this.bossTimer); this.bossTimer = 0; }
  }

  private scheduleBossLoop(): void {
    const mus = this.musBus;
    if (!this.bossOn || !this.ctx || !mus) return;
    try {
      const BEAT = 0.5;
      for (let i = 0; i < 8; i++) {
        this.noise({ dur: 0.18, peak: i % 2 === 0 ? 0.26 : 0.14, lp: 480, delay: i * BEAT, bus: mus });
        this.tone({ f0: 55, f1: 40, dur: 0.2, peak: 0.3, type: "sine", delay: i * BEAT, bus: mus });
      }
      this.tone({ f0: 49, dur: 8 * BEAT, peak: 0.18, type: "sawtooth", lp: 300, wet: true, bus: mus });
      this.tone({ f0: 69.3, dur: 8 * BEAT, peak: 0.1, type: "sawtooth", lp: 320, wet: true, bus: mus }); // tritone
    } catch { /* ignore */ }
    this.bossTimer = window.setTimeout(() => this.scheduleBossLoop(), 8 * 0.5 * 1000 - 60);
  }
}

export const audio = new AudioManager();
