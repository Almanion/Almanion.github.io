'use strict';
const assert = require('node:assert/strict');
const Stars = require('../home-stars');
const points = [[0, 0], [40, 0], [90, 0], [40, 60], [200, 0], [300, 0], [600, 0], [620, 0], [850, 0]];
const stars = points.map(([x, y]) => ({ u: x / 1000, v: y / 100 }));
const edge = (a, b, distance) => ({ a, b, distance });
const edges = [edge(0, 1, 40), edge(1, 2, 50), edge(1, 3, 60), edge(2, 3, 100),
    edge(2, 4, 110), edge(4, 5, 100), edge(6, 7, 20)];
const wave = Stars.createWavePlan(stars, edges, 1000, 100, 0, 0, 50);
assert.equal(wave.source, 0);
assert.deepEqual(wave.distances, [0, 40, 90, 100, 200, 300, Infinity, Infinity, Infinity]);
assert.equal(wave.reach, 300, 'the wave reaches all connected edges, even far outside the cursor radius');
assert.equal(Stars.createWavePlan(stars, edges, 1000, 100, 850, 0, 50), null, 'isolated stars do not launch waves');
assert.equal(Stars.createWavePlan(stars, [], 1000, 100, 0, 0, 50), null);
const disconnected = Stars.createWavePlan(stars, edges, 1000, 100, 600, 0, 30);
assert.equal(disconnected.distances[0], Infinity, 'no wave jumps between disconnected clusters');
assert.equal(disconnected.distances[7], 20);
const loop = Stars.createWavePlan(stars.slice(0, 3), [edge(0, 1, 40), edge(1, 2, 50), edge(0, 2, 140)], 1000, 100, 0, 0, 10);
assert.equal(loop.distances[2], 90, 'a shorter indirect route wins over a long direct edge');
assert.equal(loop.reach, 115, 'fronts meet inside a cycle edge before the wave finishes');
assert.equal(Stars.waveIntensity(Infinity, 300), 0);
assert.equal(Stars.waveIntensity(300, -1), 0);
assert.equal(Stars.waveIntensity(300, 277), 0);
assert.equal(Stars.waveIntensity(300, 300), 1);
assert.ok(Stars.waveIntensity(300, 325) > Stars.waveIntensity(300, 375));
assert.equal(Stars.waveIntensity(300, 400), 0, 'a finite soft trail fades fully instead of flashing repeatedly');
for (let i = 0; i < 600; i++) {
    const glow = Stars.waveIntensity(300, i);
    assert.ok(glow >= 0 && glow <= 1);
}
console.log('star waves: weighted branches, cycles, complete components and bounded soft trails passed');
