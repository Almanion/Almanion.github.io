'use strict';
const assert = require('node:assert/strict');
const E = require('../game-source/orbital-courier/eclipse/engine.js');
const B = require('../game-source/orbital-courier/eclipse/battle.js');

// Crossing ±π follows the short turn; an abrupt course change cannot snap a hull.
const turn = new B.MotionTrack();
turn.update({ x: 100, y: 100 }, 0, { heading: Math.PI - .05 });
const before = turn.angle;
turn.update({ x: 101, y: 100 }, .02, { heading: -Math.PI + .05 });
assert.ok(turn.angle > before && turn.angle - before <= 2.5 * .02);
for (let i = 2; i <= 60; i++) {
  const old = turn.angle;
  turn.update({ x: 100 + i, y: 100 }, i / 50, { heading: -1 });
  assert.ok(Math.abs(turn.angle - old) <= 2.5 / 50 + 1e-9, 'bounded angular speed');
  assert.ok(Math.abs(turn.bank) <= .25, 'small corrective bank');
}

// Exhaust samples remain at actual past emission positions when the hull turns.
const wake = new B.MotionTrack(), p = { x: 100, y: 100, vx: 60, vy: 0 };
for (let i = 0; i < 60; i++) { p.x += 1; p.y += Math.sin(i / 10); wake.update(p, i / 60, { power: 1 }); }
const first = { ...wake.samples[0] }, frozen = JSON.stringify(wake);
wake.update({ ...p, vx: 0, vy: 80 }, 59 / 60, { power: 1 });
assert.equal(JSON.stringify(wake), frozen, 'a frozen presentation clock freezes rotation and wake');
wake.update({ ...p, x: p.x + 1, vx: 0, vy: 80 }, 1, { power: 1 });
assert.deepEqual(wake.samples[0], first, 'turns do not rotate old exhaust samples');
for (let i = 61; i < 700; i++) wake.update({ x: 100 + i, y: 100, vx: 60, vy: 0 }, i / 60, { power: 1 });
assert.ok(wake.samples.length <= 56 && wake.samples.every(sample => wake.time - sample.at < 1.45));
for (let i = 700; i < 810; i++) wake.update({ x: 100 + i, y: 100, vx: 60, vy: 0 }, i / 60, { power: 0 });
assert.equal(wake.samples.length, 0, 'coasting does not create perpetual exhaust');
wake.update(p, 0, { heading: 0 }); assert.equal(wake.samples.length, 0, 'retry clears old wake');

// Fleet hull orientation is the tangent of its smooth manoeuvre, including new scenes.
for (const operation of ['eclipse', 'binary', 'ark']) for (let i = 0; i < 6; i++) for (let advance = 1; advance < 490; advance += 3) {
  const scene = E.scene ? E.scene(operation) : { moon: E.MOON, fort: E.FORT };
  const p = B.fleetAt(i, advance, scene), q = B.fleetAt(i, advance + .001, scene);
  assert.ok(Math.abs(B.angleDifference(Math.atan2(q.y - p.y, q.x - p.x), p.angle)) < .001, 'heading follows the actual course');
  assert.ok(E.distance(p, scene.moon) > scene.moon.r + 20, 'fleet cannot pass through a moon');
}
// Ark's upper lane must fit complete hulls, including the 121×48 flagship,
// through the moving extraction shutters. A safe centre point is insufficient.
const arkScene = E.scene('ark');
function fleetBounds(advance) {
  const hulls = Array.from({ length: 6 }, (_, i) => {
    const p = B.fleetAt(i, advance, arkScene), halfWidth = i === 0 ? 66 : (i === 1 ? 26 : 24) * .65 * (i === 1 ? 1.6 : .92), halfHeight = i === 0 ? 24 : 16 * .65 * (i === 1 ? 1.6 : .92);
    return { ...p, hx: Math.abs(Math.cos(p.angle)) * halfWidth + Math.abs(Math.sin(p.angle)) * halfHeight, hy: Math.abs(Math.sin(p.angle)) * halfWidth + Math.abs(Math.cos(p.angle)) * halfHeight };
  });
  const capital = hulls[0];
  for (const side of [-1, 1]) {
    const a = capital.angle, halfWidth = 25 * .65 * .42, halfHeight = 16 * .65 * .42;
    hulls.push({ x: capital.x - Math.cos(a) * 28 - Math.sin(a) * side * 29, y: capital.y - Math.sin(a) * 28 + Math.cos(a) * side * 29, hx: Math.abs(Math.cos(a)) * halfWidth + Math.abs(Math.sin(a)) * halfHeight, hy: Math.abs(Math.sin(a)) * halfWidth + Math.abs(Math.cos(a)) * halfHeight });
  }
  return hulls;
}
let gatePasses = 0;
for (let t = 0; t <= 24; t += 1 / 60) {
  const s = { operation: 'ark', phase: 2, t }, hulls = fleetBounds(B.fleetAdvance(s));
  for (const hull of hulls) {
    const nearest = { x: B.clamp(arkScene.moon.x, hull.x - hull.hx, hull.x + hull.hx), y: B.clamp(arkScene.moon.y, hull.y - hull.hy, hull.y + hull.hy) };
    assert.ok(E.distance(nearest, arkScene.moon) > arkScene.moon.r + 8, 'entire Ark hull clears the moon');
    for (const gate of E.hazardsAt(s)) if (Math.abs(hull.x - gate.x) <= hull.hx + gate.halfWidth) {
      gatePasses++;
      assert.ok(hull.y + hull.hy < gate.y - gate.halfHeight || hull.y - hull.hy > gate.y + gate.halfHeight, 'entire Ark hull clears the shutter at t=' + t.toFixed(2));
    }
  }
  // Longitudinal staggering separates the six main hulls even in the narrow lane.
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.abs(hulls[i].x - hulls[j].x) > hulls[i].hx + hulls[j].hx || Math.abs(hulls[i].y - hulls[j].y) > hulls[i].hy + hulls[j].hy, 'Ark formation hulls do not overlap');
}
assert.ok(gatePasses > 500, 'test exercises whole hulls actually crossing the gate');
for (let advance = 0; advance <= 550; advance += .5) for (const hull of fleetBounds(advance)) assert.ok(hull.y - hull.hy > 117 && hull.y + hull.hy < 213, 'Ark formation fits the common opening at any shutter phase');
const battle = new B.Timeline(), ark = { operation: 'ark', phase: 1, fleet: 3, tactic: 'escort', x: 700, y: 400 };
battle.beginBreak(ark); for (let i = 0; i < 20; i++) battle.advance(.1);
const fort = E.scene ? E.scene(ark).fort : E.FORT;
assert.ok(battle.effects.filter(effect => effect.type === 'fleet-fire').every(effect => E.distance(effect.target, fort) < 100), 'new-location salvoes target their own fortress');
console.log('Eclipse motion: short bounded turns, inertial coasting, fixed historical emission points, pause, bounded wake, continuous fleet courses and scene-aware salvoes passed');
