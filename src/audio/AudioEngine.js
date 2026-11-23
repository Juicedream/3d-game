// Procedural Realistic Web Audio Synthesizer for Weapons, Swords, Bombs, Punches, Zombies & Adaptive Music

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.musicVolume = 0.35;
    this.sfxVolume = 0.78;
    this.currentTrack = null;
    this.musicTimer = null;
    this.noiseBuffer = null;
    this.stepIndex = 0;
    this.engineOsc = null;
    this.engineGain = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);

    // Create reusable 2-second white noise buffer
    const sampleRate = this.ctx.sampleRate;
    const len = sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.03);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  // --- REALISTIC SOUND EFFECTS ---

  playGunshot(weapon = 'rifle') {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (weapon === 'shotgun') {
      // Heavy booming sub-bass + wide crack + pump clack
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.22);
      oscGain.gain.setValueAtTime(0.95, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.3);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, now);
      filter.frequency.exponentialRampToValueAtTime(320, now + 0.35);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(1.1, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.4);

      // Delayed mechanical pump sound
      this._playClick(now + 0.36, 950, 0.05, 0.22);
      this._playClick(now + 0.48, 1280, 0.06, 0.24);
      return;
    }

    if (weapon === 'pistol') {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
      oscGain.gain.setValueAtTime(0.55, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.12);

      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, now);
      filter.Q.value = 0.9;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.85, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(now);
      noise.stop(now + 0.16);
      return;
    }

    // Default Assault Rifle: sharp supersonic crack + punch + metallic bolt
    const punch = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(210, now);
    punch.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    punchGain.gain.setValueAtTime(0.8, now);
    punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    punch.connect(punchGain);
    punchGain.connect(this.sfxGain);
    punch.start(now);
    punch.stop(now + 0.14);

    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(2200, now);
    hp.frequency.exponentialRampToValueAtTime(520, now + 0.18);
    hp.Q.value = 0.7;
    const cGain = this.ctx.createGain();
    cGain.gain.setValueAtTime(0.95, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    crack.connect(hp);
    hp.connect(cGain);
    cGain.connect(this.sfxGain);
    crack.start(now);
    crack.stop(now + 0.22);

    // Metallic bolt snap
    this._playClick(now + 0.04, 3400, 0.025, 0.16);
  }

  playReload() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._playClick(now, 820, 0.05, 0.35);
    this._playClick(now + 0.28, 560, 0.07, 0.4);
    this._playClick(now + 0.65, 1100, 0.05, 0.42);
    this._playClick(now + 0.82, 1650, 0.06, 0.45);
  }

  playGrenadeThrow() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Pin ring clink + throw whoosh
    this._playClick(now, 2800, 0.04, 0.3);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, now + 0.05);
    bp.frequency.exponentialRampToValueAtTime(220, now + 0.25);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    noise.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now + 0.05);
    noise.stop(now + 0.27);
  }

  playExplosion() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Massive sub-bass boom
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + 0.9);
    subGain.gain.setValueAtTime(1.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
    sub.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 1.1);

    // Fireball shockwave roar
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(95, now + 1.25);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(1.15, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 1.35);

    // Debris crackle
    const crackle = this.ctx.createBufferSource();
    crackle.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2200, now + 0.08);
    const crGain = this.ctx.createGain();
    crGain.gain.setValueAtTime(0.32, now + 0.08);
    crGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    crackle.connect(hp);
    hp.connect(crGain);
    crGain.connect(this.sfxGain);
    crackle.start(now + 0.08);
    crackle.stop(now + 0.8);
  }

  playPunch() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Heavy body impact + air snap
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    g.gain.setValueAtTime(0.85, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);

    const slap = this.ctx.createBufferSource();
    slap.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, now);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.55, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    slap.connect(bp);
    bp.connect(sg);
    sg.connect(this.sfxGain);
    slap.start(now);
    slap.stop(now + 0.1);
  }

  playSwordSlash(comboStep = 1) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const pitchBoost = 1 + (comboStep - 1) * 0.16;

    // Blade cutting air whoosh
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900 * pitchBoost, now);
    bp.frequency.exponentialRampToValueAtTime(3600 * pitchBoost, now + 0.09);
    bp.frequency.exponentialRampToValueAtTime(600, now + 0.22);
    bp.Q.value = 2.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, now);
    g.gain.linearRampToValueAtTime(0.75, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.25);

    // Metallic katana shimmer
    const ring = this.ctx.createOscillator();
    const rg = this.ctx.createGain();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(2400 * pitchBoost, now);
    ring.frequency.exponentialRampToValueAtTime(1650 * pitchBoost, now + 0.18);
    rg.gain.setValueAtTime(0.14, now);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    ring.connect(rg);
    rg.connect(this.sfxGain);
    ring.start(now);
    ring.stop(now + 0.21);
  }

  playSwordHit() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Steel clash harmonics + hit thud
    [1850, 2940, 4120].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + 0.25);
      g.gain.setValueAtTime(0.18 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.3);
    });
    this.playPunch();
  }

  playTaiChi() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Resonant energy wave + wind push
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(165, now + 0.55);
    osc2.frequency.setValueAtTime(330, now);
    osc2.frequency.exponentialRampToValueAtTime(660, now + 0.22);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.45, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(g);
    osc2.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.62);
    osc2.stop(now + 0.62);

    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.exponentialRampToValueAtTime(1400, now + 0.25);
    bp.Q.value = 3;
    const wg = this.ctx.createGain();
    wg.gain.setValueAtTime(0.45, now);
    wg.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(this.sfxGain);
    wind.start(now);
    wind.stop(now + 0.48);
  }

  playSlide() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, now);
    bp.frequency.exponentialRampToValueAtTime(320, now + 0.42);
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.46);
  }

  playFootstep(surface = 'concrete') {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqMap = { grass: 420, sand: 680, concrete: 280, wood: 350 };
    const f = (freqMap[surface] || 320) * (0.9 + Math.random() * 0.2);
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f, now);
    bp.Q.value = 1.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.09);
  }

  playZombieGrowl() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(92 + Math.random() * 25, now);
    osc.frequency.linearRampToValueAtTime(64, now + 0.45);
    lfo.frequency.value = 19;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;

    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.52);
    lfo.stop(now + 0.52);
  }

  playPlayerHurt() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.22);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playPickup() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      g.gain.setValueAtTime(0.22, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.22);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.24);
    });
  }

  playComboChime() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 659.25, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      g.gain.setValueAtTime(0.18, now + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.18);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.2);
    });
  }

  playDisguise() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Cloth rustle + subtle ninja chime
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.28);
    this._playClick(now + 0.12, 740, 0.12, 0.15);
  }

  playFlashlightClick() {
    this.init();
    if (!this.ctx) return;
    this._playClick(this.ctx.currentTime, 2200, 0.03, 0.35);
  }

  // --- RACING CAR & COMBAT SFX ---

  startEngine() {
    this.init();
    if (!this.ctx || this.engineOsc) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'triangle';
    osc.frequency.value = 58;
    osc2.frequency.value = 116;
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    gain.gain.value = 0.09;
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc2.start();
    this.engineOsc = { osc, osc2, lp };
    this.engineGain = gain;
  }

  updateEngine(speedRatio = 0, nitro = false, slowMo = false) {
    if (!this.engineOsc || !this.ctx) return;
    const now = this.ctx.currentTime;
    const scale = slowMo ? 0.55 : 1.0;
    const baseFreq = (55 + Math.min(1.3, Math.abs(speedRatio)) * 135 + (nitro ? 45 : 0)) * scale;
    this.engineOsc.osc.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineOsc.osc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.06);
    this.engineOsc.lp.frequency.setTargetAtTime((240 + speedRatio * 620 + (nitro ? 400 : 0)) * scale, now, 0.08);
    this.engineGain.gain.setTargetAtTime(0.07 + Math.min(1, speedRatio) * 0.12 + (nitro ? 0.05 : 0), now, 0.08);
  }

  stopEngine() {
    if (this.engineOsc) {
      try {
        this.engineOsc.osc.stop();
        this.engineOsc.osc2.stop();
      } catch {}
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  playNitroBoost() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(320, now);
    bp.frequency.exponentialRampToValueAtTime(2400, now + 0.35);
    bp.Q.value = 2.0;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    noise.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.58);
  }

  playDriftScreech() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1180 + Math.random() * 140, now);
    osc.frequency.linearRampToValueAtTime(920, now + 0.16);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 5;
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playCarBlaster() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(760, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playSlowMoDrop() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sub = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(185, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.75);
    g.gain.setValueAtTime(0.85, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    sub.connect(g);
    g.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.9);
  }

  playCountdownBeep(go = false) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(go ? 987.77 : 493.88, now);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (go ? 0.45 : 0.18));
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (go ? 0.48 : 0.2));
  }

  playTrophyFanfare() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      g.gain.setValueAtTime(0.28, now + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.55);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.58);
    });
  }

  _playClick(time, freq, dur, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + dur);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  // --- ADAPTIVE PROCEDURAL BACKGROUND MUSIC ---

  playMusic(trackName) {
    if (this.currentTrack === trackName && this.musicTimer) return;
    this.stopMusic();
    this.currentTrack = trackName;
    this.init();
    if (!this.ctx) return;
    this.stepIndex = 0;

    if (trackName === 'menu') {
      const chords = [
        [130.81, 196.0, 261.63, 311.13],
        [116.54, 174.61, 233.08, 293.66],
        [103.83, 155.56, 207.65, 261.63],
        [98.0, 146.83, 196.0, 246.94]
      ];
      const tick = () => {
        if (!this.ctx || this.currentTrack !== 'menu') return;
        const now = this.ctx.currentTime;
        const chord = chords[this.stepIndex % chords.length];
        chord.forEach((f, idx) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(f, now);
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(0.09 / (idx * 0.4 + 1), now + 0.6);
          g.gain.exponentialRampToValueAtTime(0.001, now + 2.4);
          osc.connect(g);
          g.connect(this.musicGain);
          osc.start(now);
          osc.stop(now + 2.5);
        });
        this.stepIndex++;
      };
      tick();
      this.musicTimer = setInterval(tick, 2200);
    } else if (trackName === 'shooter') {
      const bassPattern = [65.41, 65.41, 77.78, 65.41, 87.31, 65.41, 98.0, 77.78];
      const tick = () => {
        if (!this.ctx || this.currentTrack !== 'shooter') return;
        const now = this.ctx.currentTime;
        const step = this.stepIndex % 16;
        // Driving synth bass
        const freq = bassPattern[step % bassPattern.length];
        const osc = this.ctx.createOscillator();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(420, now);
        lp.frequency.exponentialRampToValueAtTime(120, now + 0.16);
        const g = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.2);

        // Kick on 0, 4, 8, 12
        if (step % 4 === 0) {
          const kick = this.ctx.createOscillator();
          const kg = this.ctx.createGain();
          kick.type = 'sine';
          kick.frequency.setValueAtTime(115, now);
          kick.frequency.exponentialRampToValueAtTime(34, now + 0.11);
          kg.gain.setValueAtTime(0.28, now);
          kg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          kick.connect(kg);
          kg.connect(this.musicGain);
          kick.start(now);
          kick.stop(now + 0.15);
        }

        // Tension arpeggio accents
        if (step % 2 === 1) {
          const lead = this.ctx.createOscillator();
          const lg = this.ctx.createGain();
          lead.type = 'triangle';
          lead.frequency.setValueAtTime(freq * 4, now);
          lg.gain.setValueAtTime(0.045, now);
          lg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          lead.connect(lg);
          lg.connect(this.musicGain);
          lead.start(now);
          lead.stop(now + 0.13);
        }
        this.stepIndex++;
      };
      tick();
      this.musicTimer = setInterval(tick, 195);
    } else if (trackName === 'apocalypse') {
      // Dark zombie survival heartbeat + brooding drone
      const tick = () => {
        if (!this.ctx || this.currentTrack !== 'apocalypse') return;
        const now = this.ctx.currentTime;
        const step = this.stepIndex % 8;

        if (step === 0 || step === 1) {
          // Heartbeat thump-thump
          const hb = this.ctx.createOscillator();
          const hg = this.ctx.createGain();
          hb.type = 'sine';
          hb.frequency.setValueAtTime(step === 0 ? 72 : 60, now);
          hb.frequency.exponentialRampToValueAtTime(28, now + 0.18);
          hg.gain.setValueAtTime(step === 0 ? 0.32 : 0.22, now);
          hg.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          hb.connect(hg);
          hg.connect(this.musicGain);
          hb.start(now);
          hb.stop(now + 0.24);
        }

        if (step === 0) {
          // Eerie minor drone
          [55, 65.41, 82.41].forEach((f, idx) => {
            const dr = this.ctx.createOscillator();
            const dg = this.ctx.createGain();
            dr.type = idx === 0 ? 'sawtooth' : 'sine';
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 210;
            dr.frequency.setValueAtTime(f, now);
            dg.gain.setValueAtTime(0.001, now);
            dg.gain.linearRampToValueAtTime(0.07, now + 0.6);
            dg.gain.exponentialRampToValueAtTime(0.001, now + 2.3);
            dr.connect(lp);
            lp.connect(dg);
            dg.connect(this.musicGain);
            dr.start(now);
            dr.stop(now + 2.4);
          });
        }
        this.stepIndex++;
      };
      tick();
      this.musicTimer = setInterval(tick, 310);
    } else if (trackName === 'samurai') {
      // Hirajoshi Japanese pentatonic scale (D, E, F, A, Bb) — Koto plucks + deep taiko + flute swell
      const scale = [293.66, 329.63, 349.23, 440.0, 466.16, 587.33, 659.25, 698.46];
      const melodyIdx = [0, 3, 2, 0, 5, 4, 3, 2, 0, 1, 3, 4, 5, 3, 2, 0];
      const tick = () => {
        if (!this.ctx || this.currentTrack !== 'samurai') return;
        const now = this.ctx.currentTime;
        const step = this.stepIndex % melodyIdx.length;
        const note = scale[melodyIdx[step]];

        // Koto pluck
        const koto = this.ctx.createOscillator();
        const kg = this.ctx.createGain();
        koto.type = 'triangle';
        koto.frequency.setValueAtTime(note, now);
        kg.gain.setValueAtTime(0.16, now);
        kg.gain.exponentialRampToValueAtTime(0.001, now + 0.72);
        koto.connect(kg);
        kg.connect(this.musicGain);
        koto.start(now);
        koto.stop(now + 0.75);

        // Soft taiko drum every 4 beats
        if (step % 4 === 0) {
          const taiko = this.ctx.createOscillator();
          const tg = this.ctx.createGain();
          taiko.type = 'sine';
          taiko.frequency.setValueAtTime(98, now);
          taiko.frequency.exponentialRampToValueAtTime(48, now + 0.35);
          tg.gain.setValueAtTime(0.24, now);
          tg.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
          taiko.connect(tg);
          tg.connect(this.musicGain);
          taiko.start(now);
          taiko.stop(now + 0.45);
        }

        // Shakuhachi-like breathy flute swell every 8 beats
        if (step % 8 === 0) {
          const flute = this.ctx.createOscillator();
          const fg = this.ctx.createGain();
          flute.type = 'sine';
          flute.frequency.setValueAtTime(note * 0.5, now);
          flute.frequency.linearRampToValueAtTime(note * 0.5 * 1.015, now + 1.4);
          fg.gain.setValueAtTime(0.001, now);
          fg.gain.linearRampToValueAtTime(0.09, now + 0.5);
          fg.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
          flute.connect(fg);
          fg.connect(this.musicGain);
          flute.start(now);
          flute.stop(now + 2.3);
        }

        this.stepIndex++;
      };
      tick();
      this.musicTimer = setInterval(tick, 430);
    } else if (trackName === 'racing') {
      // High-octane Blur-style electro synthwave racing soundtrack
      const bassNotes = [73.42, 73.42, 87.31, 98.0, 110.0, 98.0, 87.31, 65.41];
      const leadNotes = [293.66, 349.23, 440.0, 523.25, 440.0, 349.23, 329.63, 293.66];
      const tick = () => {
        if (!this.ctx || this.currentTrack !== 'racing') return;
        const now = this.ctx.currentTime;
        const step = this.stepIndex % 16;

        // Pumping synth bass
        const bFreq = bassNotes[step % bassNotes.length];
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(620, now);
        lp.frequency.exponentialRampToValueAtTime(160, now + 0.14);
        bOsc.type = 'sawtooth';
        bOsc.frequency.setValueAtTime(bFreq, now);
        bGain.gain.setValueAtTime(0.18, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        bOsc.connect(lp);
        lp.connect(bGain);
        bGain.connect(this.musicGain);
        bOsc.start(now);
        bOsc.stop(now + 0.16);

        // Four-on-the-floor racing kick
        if (step % 4 === 0) {
          const kick = this.ctx.createOscillator();
          const kg = this.ctx.createGain();
          kick.type = 'sine';
          kick.frequency.setValueAtTime(130, now);
          kick.frequency.exponentialRampToValueAtTime(36, now + 0.1);
          kg.gain.setValueAtTime(0.28, now);
          kg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          kick.connect(kg);
          kg.connect(this.musicGain);
          kick.start(now);
          kick.stop(now + 0.14);
        }

        // Energetic synth lead arp
        if (step % 2 === 0) {
          const lOsc = this.ctx.createOscillator();
          const lg = this.ctx.createGain();
          lOsc.type = 'square';
          lOsc.frequency.setValueAtTime(leadNotes[(step / 2) % leadNotes.length], now);
          lg.gain.setValueAtTime(0.045, now);
          lg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          lOsc.connect(lg);
          lg.connect(this.musicGain);
          lOsc.start(now);
          lOsc.stop(now + 0.13);
        }
        this.stepIndex++;
      };
      tick();
      this.musicTimer = setInterval(tick, 165);
    }
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.currentTrack = null;
  }
}

export const audio = new AudioEngine();
