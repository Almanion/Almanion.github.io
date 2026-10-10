'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const diagram = require('../tools/generate-intermolecular-diagram.js');
const { model, geometry, turningPoints } = diagram;
const svg = fs.readFileSync(path.join(__dirname, '../images/notes/physics-10/intermolecular-interaction.svg'), 'utf8').replace(/\r\n/g, '\n');

// Scientific invariants: signs, monotonic component forces, and force/potential consistency.
for (let r = 0.8; r <= 2.5; r += 0.025) {
    assert.ok(model.repulsion(r) > 0);
    assert.ok(model.attraction(r) < 0);
    assert.ok(model.repulsion(r + 0.001) < model.repulsion(r));
    assert.ok(model.attraction(r + 0.001) > model.attraction(r));
    const h = 1e-6;
    const negativeDerivative = -(model.potential(r + h) - model.potential(r - h)) / (2 * h);
    assert.ok(Math.abs(model.force(r) - negativeDerivative) < 1e-7 * Math.max(1, Math.abs(model.force(r))), `F = -dU/dr at r=${r}`);
    assert.equal(Math.sign(model.force(r)), Math.sign(1 - r));
}
assert.equal(model.force(1), 0);
assert.ok(model.potential(0.999) > model.potential(1));
assert.ok(model.potential(1.001) > model.potential(1));
assert.ok(model.potential(100) < 0 && Math.abs(model.potential(100)) < 1e-10);
assert.ok(model.force(100) < 0 && Math.abs(model.force(100)) < 1e-10);
assert.ok(Math.abs(model.potential(2 ** (-1 / 6))) < 1e-14);
const [r1, r2, r3] = turningPoints();
assert.ok(r1 < r2 && r2 < 1 && 1 < r3);
assert.ok(Math.abs(model.potential(r1) - model.energy1) < 1e-14);
assert.ok(Math.abs(model.potential(r2) - model.energy2) < 1e-14);
assert.ok(Math.abs(model.potential(r3) - model.energy2) < 1e-14);

// Check the actual SVG curves, not just the functions used to generate them.
function points(id) {
    const d = svg.match(new RegExp(`<path id="${id}"[^>]* d="([^"]+)"`))[1];
    return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
}
const repulsion = points('repulsion-curve');
const attraction = points('attraction-curve');
const force = points('force-curve');
const potential = points('energy-curve');
assert.equal(repulsion.length, attraction.length);
assert.equal(force.length, potential.length);
for (let i = 0; i < force.length; i++) {
    assert.equal(repulsion[i][0], attraction[i][0]);
    assert.equal(force[i][0], potential[i][0]);
    // A shared force scale makes the drawn resultant the pointwise sum.
    assert.ok(Math.abs(repulsion[i][1] + attraction[i][1] - geometry.forceZero - force[i][1]) <= 0.002);
}
const forceDot = svg.match(/id="force-equilibrium" cx="([^"]+)" cy="([^"]+)"/);
const energyDot = svg.match(/id="energy-equilibrium" cx="([^"]+)" cy="([^"]+)"/);
assert.equal(forceDot[1], energyDot[1], 'equilibrium distance agrees on both graphs');
assert.equal(Number(forceDot[2]), geometry.forceZero);
assert.equal(Number(energyDot[2]), Math.max(...potential.map(p => p[1])), 'energy marker is exactly at the minimum');
assert.equal(svg, diagram.render(), 'published SVG agrees with the checked generator');
console.log('intermolecular diagram: physical and rendered-geometry invariants passed');
