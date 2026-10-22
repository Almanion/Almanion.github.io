(function (root) {
  'use strict';
  const TAU = Math.PI * 2, clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const smooth = n => { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); };
  const DURATION = 4.2;
  function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
  function fleetAt(index, advance = 0) {
    const x = 63 + index % 2 * 65 + advance, initialY = 383 + index * 43;
    // The battle line passes beneath the moon, never through its silhouette.
    const y = initialY + (505 + index * 18 - initialY) * smooth((x - 150) / 145);
    return { x, y, angle: advance > 320 ? -.14 : -.035, index };
  }
  function batteryAt(index = 0) { return { x: 797 + Math.abs(index - 1) * 8, y: 325 + (index - 1) * 28 }; }
  function shieldPieces() {
    const rand = random(723);
    return Array.from({ length: 36 }, (_, i) => {
      const a = Math.PI - 1.19 + i / 36 * 2.38, width = .045 + rand() * .03;
      return { a, width, r: 109 + rand() * 9, speed: 36 + rand() * 75, spin: (rand() - .5) * 2, delay: rand() * .16, length: 7 + rand() * 14 };
    });
  }
  class Timeline {
    constructor() { this.reset(); }
    reset() { this.time = 0; this.effects = []; this.serial = 0; this.breakAt = null; this.breakState = null; this.cues = []; this.wave = 0; this.assaultRound = 0; this.charged = 0; this.fired = 0; }
    emit(type, point, data = {}) {
      const effect = { type, x: point.x, y: point.y, at: this.time, seed: ++this.serial * 317, ...data };
      this.effects.push(effect);
      if (this.effects.length > 96) this.effects.splice(0, this.effects.length - 96);
      this.cues.push({ type, pan: clamp((point.x - 550) / 650, -.85, .85) });
      return effect;
    }
    receive(ev, state) {
      if (ev.type === 'salvo') this.emit('wreck', fleetAt(state.fleet), { index: state.fleet });
      else if (['fire', 'hit', 'ally-hit', 'protect', 'blocked', 'shield'].includes(ev.type)) {
        this.emit(ev.type, ev, { from: { x: state.x, y: state.y } });
      }
    }
    beginBreak(state) {
      this.breakAt = this.time; this.breakState = { fleet: state.fleet, tactic: state.tactic, x: state.x, y: state.y };
      this.emit('overload', { x: 870, y: 325 }, { tactic: state.tactic, from: { x: state.x, y: state.y } });
    }
    get breakAge() { return this.breakAt === null ? null : this.time - this.breakAt; }
    volley(fleet, advance, wave) {
      for (let i = 0; i < fleet; i++) {
        const from = fleetAt(i, advance), a = (i * 1.9 + wave * .9) % TAU;
        this.emit('fleet-fire', { x: from.x + (i === 0 ? 52 : 13), y: from.y }, { index: i, delay: i * .045, target: { x: 870 + Math.cos(a) * (34 + i * 5), y: 325 + Math.sin(a) * (35 + i * 4) } });
      }
    }
    advance(dt, { paused = false, phase = 0, running = false, fleet = 6, flightTime = 0 } = {}) {
      if (paused) return;
      const oldAge = this.breakAge; this.time += Math.max(0, Math.min(.1, dt));
      if (phase < 2 && running) {
        const round = Math.floor(flightTime / 5) + 1, position = flightTime % 5;
        if (position >= 3.85 && round > this.charged) { this.charged = round; this.cues.push({ type: 'enemy-charge', pan: .6 }); }
        if (position >= 4.28 && round > this.fired) { this.fired = round; this.cues.push({ type: 'enemy-fire', pan: .6 }); }
      }
      const age = this.breakAge;
      if (age !== null) {
        if (oldAge < .32 && age >= .32) this.emit('fracture', { x: 870, y: 325 });
        while (this.wave < 3 && age >= 1.12 + this.wave * .85) {
          this.volley(this.breakState.fleet, 112 * smooth((age - .7) / 3.5), this.wave++);
        }
      } else if (phase === 2 && running) {
        const round = Math.floor(flightTime / 1.9) + 1;
        if (round > this.assaultRound) { this.assaultRound = round; this.volley(fleet, 112 + Math.min(flightTime, 14) * 27, round); }
      }
      // Arrival effects are on the presentation clock, independent of playback speed.
      for (const fx of this.effects.slice()) if (fx.type === 'fleet-fire' && !fx.arrived && this.time - fx.at >= .63 + fx.delay) {
        fx.arrived = true; this.emit('fort-impact', fx.target, { heavy: fx.index === 0 });
      }
      this.effects = this.effects.filter(fx => this.time - fx.at < (fx.type === 'wreck' ? 7 : 3.6));
    }
    takeCues() { const cues = this.cues; this.cues = []; return cues; }
  }
  function playCue(sound, cue, reduced = false) {
    const pan = cue.pan, v = options => sound.voice({ pan, ...options });
    if (cue.type === 'enemy-charge') { v({ frequency: 70, end: 270, duration: .35, volume: .09, type: 'triangle' }); }
    else if (cue.type === 'enemy-fire') { v({ frequency: 190, end: 36, duration: .45, volume: .16, type: 'triangle' }); v({ noise: true, filter: 1100, duration: .2, volume: .12 }); }
    else if (cue.type === 'fire') { v({ frequency: 840, end: 170, duration: .15, volume: .045, type: 'triangle' }); }
    else if (cue.type === 'fleet-fire') {
      v({ frequency: 130, end: 42, duration: .28, volume: .05, type: 'triangle' });
      v({ noise: true, filter: 1300, duration: .12, volume: .035 });
    } else if (['hit', 'ally-hit', 'wreck', 'fort-impact'].includes(cue.type)) {
      v({ frequency: 76, end: 25, duration: .55, volume: .11 });
      v({ noise: true, filter: cue.type === 'wreck' ? 280 : 700, duration: .43, volume: .12 });
    } else if (['protect', 'blocked', 'shield'].includes(cue.type)) {
      v({ frequency: 340, end: 1250, duration: .16, volume: .045 });
      v({ frequency: 940, end: 410, duration: .38, volume: .055, type: 'triangle' });
    } else if (cue.type === 'overload') {
      v({ frequency: 110, end: 670, duration: .32, volume: .12, type: 'triangle' });
    } else if (cue.type === 'fracture') {
      v({ noise: true, filter: 2400, duration: .6, volume: reduced ? .1 : .16 });
      v({ frequency: 95, end: 22, duration: 1.35, volume: .22 });
      v({ frequency: 740, end: 120, duration: 1, volume: .04, type: 'triangle' });
    }
  }
  const api = { Timeline, DURATION, fleetAt, batteryAt, shieldPieces, random, smooth, clamp, playCue };
  root.EclipseBattle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
