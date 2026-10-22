(function (root) {
  'use strict';
  const TAU = Math.PI * 2, clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const smooth = n => { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); };
  const DURATION = 4.2;
  function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
  const DEFAULT_SCENE = { moon: { x: 410, y: 350, r: 94 }, fort: { x: 870, y: 325 }, node: { x: 650, y: 185 }, exit: { x: 125, y: 135 } };
  function sceneFor(state) { return root.EclipseEngine?.scene ? root.EclipseEngine.scene(state) : DEFAULT_SCENE; }
  function fleetAt(index, advance = 0, scene = DEFAULT_SCENE) {
    if (scene.theme === 'ark') {
      // The yard has a narrow upper transit lane. Stagger the broad flagship and
      // its escorts longitudinally, inside the overlap of every shutter opening.
      const formation = [[120, 165], [230, 145], [230, 185], [25, 145], [25, 185], [335, 165]];
      const slot = formation[clamp(index, 0, formation.length - 1)], x = slot[0] + advance;
      const u = clamp((x - 80) / 460, 0, 1), y = slot[1] + 3 * Math.sin(Math.PI * u) ** 2;
      const slope = u > 0 && u < 1 ? 3 * Math.PI * Math.sin(TAU * u) / 460 : 0;
      return { x, y, angle: Math.atan2(slope, 1), index };
    }
    const x = 63 + index % 2 * 65 + advance, initialY = 383 + index * 43;
    // A continuous manoeuvre, with its heading derived from the course itself.
    const safeY = Math.min(505, Math.max(430, scene.moon.y + scene.moon.r + 60));
    const rise = safeY + index * 18 - initialY, u = clamp((x - 150) / 145, 0, 1), v = clamp((x - 380) / 280, 0, 1);
    const y = initialY + rise * smooth(u) - 22 * smooth(v);
    const slope = rise * 6 * u * (1 - u) / 145 - 22 * 6 * v * (1 - v) / 280;
    return { x, y, angle: Math.atan2(slope, 1), index };
  }
  function fleetAdvance(state, breakAge = null) { return state.phase === 2 ? 112 + Math.min(state.t, 14) * 27 : breakAge === null ? 0 : 112 * smooth((breakAge - .7) / 3.5); }
  function batteryAt(index = 0, scene = DEFAULT_SCENE) { return { x: scene.fort.x - 73 + Math.abs(index - 1) * 8, y: scene.fort.y + (index - 1) * 28 }; }
  const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  // Presentation state only: positions are always supplied by the simulation.
  // It cannot introduce drag or change a collision, and advances only on its clock.
  class MotionTrack {
    constructor() { this.reset(); }
    reset() { this.angle = null; this.rate = 0; this.bank = 0; this.time = null; this.samples = []; this.lastHeading = null; }
    update(p, time, { heading, power = 0, size = 1, snap = false, maxRate = 2.5 } = {}) {
      if (![p.x, p.y, time].every(Number.isFinite)) return this;
      if (this.time !== null && time < this.time) this.reset();
      const target = Number.isFinite(heading) ? heading : Math.atan2(p.vy || 0, p.vx || 1), dt = this.time === null ? 0 : clamp(time - this.time, 0, .1);
      if (this.angle === null || snap) { this.angle = target; this.rate = 0; this.bank = 0; }
      else if (dt > 0) {
        const lead = this.lastHeading === null ? 0 : clamp(angleDifference(target, this.lastHeading) / dt * .08, -.16, .16);
        const turn = clamp(angleDifference(target + lead, this.angle) * (1 - Math.exp(-dt * 6)), -maxRate * dt, maxRate * dt);
        this.angle += turn; this.rate = turn / dt; this.bank += (clamp(this.rate / maxRate, -1, 1) * .25 - this.bank) * (1 - Math.exp(-dt * 8));
      }
      if (this.time === null || time - this.time > 1e-7) {
        const nozzle = 12 * size, x = p.x - Math.cos(this.angle) * nozzle, y = p.y - Math.sin(this.angle) * nozzle;
        if (power > .015 && (!this.samples.length || time - this.samples[this.samples.length - 1].at >= 1 / 45)) this.samples.push({ x, y, at: time, angle: this.angle, power: clamp(power, 0, 1), size });
        this.samples = this.samples.filter(sample => time - sample.at < 1.45).slice(-56);
        this.lastHeading = target; this.time = time;
      }
      return this;
    }
  }
  function shieldPieces() {
    const rand = random(723);
    return Array.from({ length: 36 }, (_, i) => {
      const a = Math.PI - 1.19 + i / 36 * 2.38, width = .045 + rand() * .03;
      return { a, width, r: 109 + rand() * 9, speed: 36 + rand() * 75, spin: (rand() - .5) * 2, delay: rand() * .16, length: 7 + rand() * 14 };
    });
  }
  class Timeline {
    constructor() { this.reset(); }
    reset() { this.time = 0; this.effects = []; this.serial = 0; this.breakAt = null; this.breakState = null; this.cues = []; this.wave = 0; this.assaultRound = 0; this.charged = 0; this.fired = 0; this.scene = DEFAULT_SCENE; }
    emit(type, point, data = {}) {
      const effect = { type, x: point.x, y: point.y, at: this.time, seed: ++this.serial * 317, ...data };
      this.effects.push(effect);
      if (this.effects.length > 96) this.effects.splice(0, this.effects.length - 96);
      this.cues.push({ type, pan: clamp((point.x - 550) / 650, -.85, .85) });
      return effect;
    }
    receive(ev, state) {
      this.scene = sceneFor(state);
      if (ev.type === 'salvo') this.emit('wreck', fleetAt(state.fleet, fleetAdvance(state, this.breakAge), this.scene), { index: state.fleet });
      else if (['fire', 'hit', 'ally-hit', 'protect', 'blocked', 'shield', 'signal', 'jammed', 'storm-hit', 'torpedo', 'boost', 'brake', 'objective'].includes(ev.type)) {
        this.emit(ev.type, ev, { from: { x: state.x, y: state.y } });
      }
    }
    beginBreak(state) {
      this.scene = sceneFor(state);
      this.breakAt = this.time; this.breakState = { fleet: state.fleet, tactic: state.tactic, x: state.x, y: state.y };
      this.emit('overload', this.scene.fort, { tactic: state.tactic, from: { x: state.x, y: state.y } });
    }
    get breakAge() { return this.breakAt === null ? null : this.time - this.breakAt; }
    volley(fleet, advance, wave) {
      for (let i = 0; i < fleet; i++) {
        const from = fleetAt(i, advance, this.scene), a = (i * 1.9 + wave * .9) % TAU, length = i === 0 ? 52 : 13;
        this.emit('fleet-fire', { x: from.x + Math.cos(from.angle) * length, y: from.y + Math.sin(from.angle) * length }, { index: i, delay: i * .045, target: { x: this.scene.fort.x + Math.cos(a) * (34 + i * 5), y: this.scene.fort.y + Math.sin(a) * (35 + i * 4) } });
      }
    }
    advance(dt, { paused = false, phase = 0, running = false, fleet = 6, flightTime = 0, jammed = false, scene, state } = {}) {
      if (paused) return;
      if (scene) this.scene = scene; else if (state) this.scene = sceneFor(state);
      const oldAge = this.breakAge; this.time += Math.max(0, Math.min(.1, dt));
      if (phase < 2 && running && !jammed) {
        const round = Math.floor(flightTime / 5) + 1, position = flightTime % 5;
        if (position >= 3.85 && round > this.charged) { this.charged = round; this.cues.push({ type: 'enemy-charge', pan: .6 }); }
        if (position >= 4.28 && round > this.fired) { this.fired = round; this.cues.push({ type: 'enemy-fire', pan: .6 }); }
      }
      const age = this.breakAge;
      if (age !== null) {
        if (oldAge < .32 && age >= .32) this.emit('fracture', this.scene.fort);
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
    else if (cue.type === 'torpedo') { v({ noise: true, filter: 800, duration: .34, volume: .065 }); v({ frequency: 180, end: 65, duration: .4, volume: .065, type: 'triangle' }); }
    else if (['signal', 'jammed', 'objective'].includes(cue.type)) { v({ frequency: 480, end: 960, duration: .28, volume: .06, type: 'sine' }); v({ frequency: 720, end: 1440, duration: .45, volume: .045, type: 'triangle' }); }
    else if (['boost', 'brake'].includes(cue.type)) { v({ noise: true, filter: cue.type === 'boost' ? 950 : 1600, duration: .36, volume: .055 }); v({ frequency: cue.type === 'boost' ? 70 : 180, end: cue.type === 'boost' ? 160 : 60, duration: .3, volume: .045, type: 'triangle' }); }
    else if (cue.type === 'fleet-fire') {
      v({ frequency: 130, end: 42, duration: .28, volume: .05, type: 'triangle' });
      v({ noise: true, filter: 1300, duration: .12, volume: .035 });
    } else if (['hit', 'ally-hit', 'wreck', 'fort-impact', 'storm-hit'].includes(cue.type)) {
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
  const api = { Timeline, MotionTrack, DURATION, fleetAt, fleetAdvance, batteryAt, shieldPieces, random, smooth, clamp, playCue, angleDifference };
  root.EclipseBattle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
