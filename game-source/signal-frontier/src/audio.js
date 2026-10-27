/* Layered, bounded procedural audio. No network assets or progress state. */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const quiet = new Set([
    "order",
    "collect",
    "upgrade",
    "build",
    "post-ready",
    "salvage",
    "reload",
    "end",
    "raid",
  ]);
  class SignalAudio {
    constructor(options = {}) {
      this.ctx = options.context || null;
      this.getVolume = options.volume || (() => 40);
      this.listener = { x: 0, y: 0 };
      this.last = {};
      this.voices = new Set();
      this.ready = false;
      this.serial = 0;
      this.ambientLevel = 0;
      this.mode = "menu";
      this.won = false;
      this.charges = new Map();
      this.walk = { x: null, y: null, distance: 0 };
    }
    setup() {
      if (this.ready || !this.ctx) return;
      const c = this.ctx;
      this.master = c.createGain();
      this.volumeValue = clamp(this.getVolume(), 0, 100) / 100;
      this.master.gain.value = this.volumeValue;
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -12;
      this.limiter.knee.value = 12;
      this.limiter.ratio.value = 5;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.18;
      this.limiter.connect(this.master);
      this.master.connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const samples = this.noise.getChannelData(0);
      let seed = 5831;
      for (let i = 0; i < samples.length; i++) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        samples[i] = (seed / 4294967296) * 2 - 1;
      }
      this.ambience = c.createGain();
      this.ambience.gain.value = 0;
      this.ambience.connect(this.limiter);
      const rumble = c.createBufferSource(),
        low = c.createBiquadFilter();
      rumble.buffer = this.noise;
      rumble.loop = true;
      low.type = "lowpass";
      low.frequency.value = 240;
      low.Q.value = 0.5;
      rumble.connect(low);
      low.connect(this.ambience);
      rumble.start();
      this.bedNodes = [rumble, low];
      for (const [frequency, level] of [
        [66, 0.2],
        [99.3, 0.07],
        [132.1, 0.035],
      ]) {
        const osc = c.createOscillator(),
          gain = c.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency;
        gain.gain.value = level;
        osc.connect(gain);
        gain.connect(this.ambience);
        osc.start();
        this.bedNodes.push(osc, gain);
      }
      this.ready = true;
    }
    start() {
      try {
        if (!this.ctx)
          this.ctx = new (root.AudioContext || root.webkitAudioContext)();
        this.setup();
        if (this.ctx.state !== "closed" && this.ctx.resume)
          return this.ctx.resume().catch(() => {});
      } catch (_) {}
      return Promise.resolve();
    }
    stop() {
      this.ambientLevel = 0;
      if (!this.ready) return;
      this.ambience.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ambience.gain.setValueAtTime(0, this.ctx.currentTime);
      for (const voice of [...this.voices]) voice.close();
      this.last = {};
      if (this.ctx.state !== "closed" && this.ctx.suspend)
        this.ctx.suspend().catch(() => {});
    }
    update(s, mode, volume = this.getVolume()) {
      this.listener = s.units.find((u) => u.id === s.heroId) || this.listener;
      this.mode = mode;
      this.won = s.status === "won";
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const level = clamp(volume, 0, 100) / 100;
      if (level !== this.volumeValue) {
        this.master.gain.setTargetAtTime(level, now, 0.025);
        this.volumeValue = level;
      }
      const active = mode === "playing" && s.status === "playing";
      if (s.fog) {
        for (const voice of [...this.voices])
          if (
            voice.spatial &&
            !root.SignalEngine.visible(s, s.fog.team, voice.point)
          )
            voice.close();
        const ids = new Set(s.units.map((u) => u.id));
        for (const id of this.charges.keys())
          if (!ids.has(id)) this.charges.delete(id);
      }
      for (const u of s.units.filter((u) => u.team && u.hp > 0)) {
        if (
          active &&
          u.wind > 0 &&
          !(this.charges.get(u.id) > 0) &&
          u.kind !== "runner"
        )
          this.play({ type: "charge", id: u.id, kind: u.kind, x: u.x, y: u.y });
        this.charges.set(u.id, u.wind);
      }
      const distance =
        this.walk.x === null
          ? 0
          : Math.hypot(
              this.listener.x - this.walk.x,
              this.listener.y - this.walk.y,
            );
      if (active && distance < 50 && s.dashT === 0) {
        this.walk.distance += distance;
        if (this.walk.distance > 40) {
          this.play({ type: "step", x: this.listener.x, y: this.listener.y });
          this.walk.distance %= 40;
        }
      }
      this.walk.x = this.listener.x;
      this.walk.y = this.listener.y;
      const target = active
        ? s.terminal.window > 0
          ? 0.025
          : s.relay.online
            ? 0.035
            : 0.045
        : 0;
      if (target !== this.ambientLevel) {
        this.ambientLevel = target;
        this.ambience.gain.setTargetAtTime(
          target,
          now,
          target === 0 ? 0.05 : 0.6,
        );
      }
    }
    play(e) {
      const c = this.ctx;
      if (
        !this.ready ||
        (c.state !== "running" && typeof c.startRendering !== "function") ||
        this.getVolume() === 0
      )
        return false;
      const type = e.type,
        now = c.currentTime,
        key =
          type === "shot"
            ? type + e.kind
            : type === "charge"
              ? type + e.id
              : type;
      const interval =
        type === "shot"
          ? 0.045
          : ["hit", "spark", "shield"].includes(type)
            ? 0.07
            : 0.035;
      if (now - (this.last[key] ?? -100) < interval || this.voices.size >= 24)
        return false;
      const spatial = !quiet.has(type) && !e.radio;
      const distance = spatial
        ? Math.hypot((e.x || 0) - this.listener.x, (e.y || 0) - this.listener.y)
        : 0;
      if (distance > 1400) return false;
      const gain = c.createGain();
      gain.gain.value = spatial ? 1 / (1 + (distance / 460) ** 2) : 1;
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) {
        pan.pan.value = spatial
          ? clamp(((e.x || 0) - this.listener.x) / 650, -0.8, 0.8)
          : 0;
        gain.connect(pan);
        pan.connect(this.limiter);
      } else gain.connect(this.limiter);
      const nodes = [gain, ...(pan ? [pan] : [])],
        sources = [];
      let pending = 0,
        closed = false;
      const voice = {
        spatial,
        point: { x: e.x || 0, y: e.y || 0 },
        close: () => {
          if (closed) return;
          closed = true;
          for (const source of sources) {
            try {
              source.stop();
            } catch (_) {}
          }
          for (const node of nodes) node.disconnect();
          this.voices.delete(voice);
        },
      };
      const layer = (
        kind,
        frequency,
        endFrequency,
        length,
        level,
        delay = 0,
        filterType,
      ) => {
        const at = now + delay,
          envelope = c.createGain();
        const source =
          kind === "noise" ? c.createBufferSource() : c.createOscillator();
        if (kind === "noise") source.buffer = this.noise;
        else {
          source.type = kind;
          source.frequency.setValueAtTime(frequency, at);
          source.frequency.exponentialRampToValueAtTime(
            Math.max(20, endFrequency),
            at + length,
          );
        }
        source.connect(envelope);
        envelope.gain.setValueAtTime(0.00001, at);
        envelope.gain.exponentialRampToValueAtTime(
          Math.max(0.00002, level),
          at + Math.min(0.008, length * 0.15),
        );
        envelope.gain.exponentialRampToValueAtTime(0.00001, at + length);
        if (filterType || kind === "noise") {
          const filter = c.createBiquadFilter();
          filter.type = filterType || "lowpass";
          filter.frequency.setValueAtTime(frequency, at);
          filter.frequency.exponentialRampToValueAtTime(
            Math.max(30, endFrequency),
            at + length,
          );
          filter.Q.value = 0.65;
          envelope.connect(filter);
          filter.connect(gain);
          nodes.push(filter);
        } else envelope.connect(gain);
        sources.push(source);
        nodes.push(source, envelope);
        pending++;
        source.onended = () => {
          if (--pending === 0) voice.close();
        };
        source.start(at);
        source.stop(at + length + 0.02);
      };
      const tone = (f, end, length, level, delay = 0, wave = "sine") =>
        layer(wave, f, end, length, level, delay);
      const noise = (f, end, length, level, delay = 0, filter = "lowpass") =>
        layer("noise", f, end, length, level, delay, filter);
      const variation = 1 + ((this.serial++ % 7) - 3) * 0.012;
      if (type === "step") {
        noise(900, 300, 0.045, 0.032, 0, "bandpass");
        tone(105, 65, 0.05, 0.018);
      } else if (type === "rocket") {
        noise(1800, 260, 0.65, 0.18, 0, "bandpass");
        tone(110, 42, 0.3, 0.12);
      } else if (type === "flame") {
        noise(600, 1300, 1.2, 0.2, 0, "bandpass");
        tone(78, 51, 0.8, 0.07);
      } else if (type === "charge" && e.kind === "bomber") {
        for (let i = 0; i < 3; i++)
          tone(540 + i * 180, 500 + i * 180, 0.07, 0.04, i * 0.22, "triangle");
      } else if (type === "charge") {
        tone(220, 380, 0.38, 0.028);
        noise(1100, 1800, 0.22, 0.025, 0, "bandpass");
      } else if (type === "shot") {
        if (e.kind === "runner") {
          noise(1200, 180, 0.12, 0.18);
          tone(145, 58, 0.1, 0.08);
        } else if (e.team) {
          tone(280 * variation, 86, 0.22, 0.1, 0, "triangle");
          noise(1800, 520, 0.07, 0.1);
          tone(880, 500, 0.045, 0.025);
        } else {
          noise(3800, 800, 0.055, e.kind === "hero" ? 0.15 : 0.11);
          tone(190 * variation, 75, 0.13, 0.13);
          tone(980, 480, 0.025, 0.025, 0, "triangle");
          noise(600, 220, 0.09, 0.05, 0.04);
        }
      } else if (type === "mortar") {
        tone(105, 36, 0.55, 0.28);
        noise(1900, 130, 0.3, 0.3);
        noise(900, 280, 0.1, 0.08, 0.17);
      } else if (type === "blast" || type === "destroy") {
        const heavy =
          type === "blast" || ["citadel", "base", "jammer"].includes(e.kind);
        noise(
          heavy ? 1400 : 2400,
          100,
          heavy ? 0.85 : 0.34,
          heavy ? 0.32 : 0.18,
        );
        tone(heavy ? 90 : 150, 32, heavy ? 0.72 : 0.28, heavy ? 0.25 : 0.1);
        noise(2100, 550, 0.08, 0.07, 0.12);
        noise(900, 220, 0.16, 0.045, 0.25);
      } else if (type === "hit" || type === "spark") {
        noise(3200, 1200, 0.055, 0.075);
        tone(
          (type === "spark" ? 1260 : 730) * variation,
          260,
          0.09,
          0.025,
          0,
          "triangle",
        );
      } else if (type === "hurt") {
        noise(680, 180, 0.16, 0.12);
        tone(105, 60, 0.19, 0.14);
      } else if (type === "shield") {
        tone(620, 360, 0.23, 0.075);
        tone(934, 670, 0.18, 0.035);
        noise(4000, 1600, 0.04, 0.055, 0, "highpass");
      } else if (type === "dash") {
        noise(1800, 200, 0.25, 0.17, 0, "bandpass");
        tone(150, 45, 0.22, 0.06);
      } else if (type === "reload") {
        noise(2400, 900, 0.055, 0.06);
        tone(420, 260, 0.045, 0.035);
        noise(1600, 500, 0.06, 0.07, 0.82);
        tone(320, 240, 0.055, 0.025, 1.02);
      } else if (type === "order") {
        tone(640, 520, 0.055, 0.035);
        tone(970, 860, 0.06, 0.02, 0.035);
      } else if (type === "collect" || type === "salvage") {
        tone(520, 520, 0.12, 0.04);
        tone(780, 780, 0.17, 0.032, 0.075);
        noise(1500, 400, 0.05, 0.035);
      } else if (type === "build") {
        noise(950, 150, 0.19, 0.1);
        tone(130, 78, 0.22, 0.07);
      } else if (
        ["online", "post-ready", "upgrade", "reinforce"].includes(type)
      ) {
        for (const [i, f] of [262, 393, 524].entries())
          tone(f, f * 0.99, 0.32, 0.035, i * 0.09);
        noise(800, 150, 0.35, 0.045);
      } else if (type === "raid") {
        tone(210, 150, 0.32, 0.09, 0, "triangle");
        tone(315, 210, 0.26, 0.07, 0.16, "sine");
      } else if (type === "breach") {
        noise(2200, 180, 0.48, 0.11, 0, "bandpass");
        tone(420, 110, 0.65, 0.09);
        tone(630, 165, 0.5, 0.035, 0.07);
      } else if (type === "end") {
        for (const [i, f] of (this.won
          ? [196, 294, 392]
          : [196, 174, 130]
        ).entries())
          tone(f, f, 0.7, 0.055, i * 0.16);
      }
      if (!pending) {
        voice.close();
        return false;
      }
      this.voices.add(voice);
      this.last[key] = now;
      return true;
    }
    diagnostics() {
      return {
        state: this.ctx?.state || "uninitialized",
        voices: this.voices.size,
        ambience: this.ambientLevel,
        volume: this.ready ? this.master.gain.value : this.getVolume() / 100,
      };
    }
  }
  root.SignalAudio = SignalAudio;
})(typeof window === "undefined" ? globalThis : window);
