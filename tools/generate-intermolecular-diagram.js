#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// A = B = 1 in arbitrary consistent units; therefore r0 = 1.
// U(infinity) = 0 and F = -dU/dr. Plot axes have independent vertical scales.
const model = Object.freeze({
    repulsion: r => r ** -13,
    attraction: r => -(r ** -7),
    force: r => r ** -13 - r ** -7,
    potential: r => r ** -12 / 12 - r ** -6 / 6,
    equilibrium: 1,
    energy1: 0.65 / 12,
    energy2: -0.65 / 12
});

const geometry = Object.freeze({
    width: 720, height: 1270,
    left: 82, right: 628, maximumR: 2.6,
    forceZero: 360, forceScale: 94,
    energyZero: 880, energyScale: 2040,
    forceTop: 180, forceBottom: 548,
    energyTop: 740, energyBottom: 1095
});

const x = r => geometry.left + (geometry.right - geometry.left) * r / geometry.maximumR;
const forceY = f => geometry.forceZero - geometry.forceScale * f;
const energyY = u => geometry.energyZero - geometry.energyScale * u;
const number = n => n.toFixed(3);
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function label(px, py, value, className = 'label', extra = '') {
    const content = escape(value).replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, value =>
        '<tspan baseline-shift="sub" font-size="70%" font-style="normal">' +
        [...value].map(c => '₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join('') + '</tspan>');
    return `<text x="${number(px)}" y="${number(py)}" class="${className}" ${extra}>${content}</text>`;
}

function line(x1, y1, x2, y2, className, extra = '') {
    return `<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}" class="${className}" ${extra}/>`;
}

function sampled(fn, mapY) {
    // Sample exact functions. Include the equilibrium and all turning points explicitly.
    const radii = Array.from({ length: 1301 }, (_, i) => 0.76 + (2.55 - 0.76) * i / 1300);
    radii.push(1, ...turningPoints());
    return radii.sort((a, b) => a - b).map((r, i) =>
        `${i ? 'L' : 'M'}${number(x(r))} ${number(mapY(fn(r)))}`).join(' ');
}

function turningPoints() {
    // 12U = z^2 - 2z, where z = r^-6. The roots correspond to U(r) = E.
    const root = Math.sqrt(1 + 12 * model.energy2);
    return [
        (1 + Math.sqrt(1 + 12 * model.energy1)) ** (-1 / 6),
        (1 + root) ** (-1 / 6),
        (1 - root) ** (-1 / 6)
    ];
}

function render() {
    const r0 = x(model.equilibrium);
    const [r1, r2, r3] = turningPoints();
    const parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1270" role="img" aria-labelledby="title desc">',
        '<title id="title">Сила взаимодействия молекул и потенциальная энергия</title>',
        '<desc id="desc">Сила отталкивания положительна и убывает как r в степени минус 13. Сила притяжения отрицательна и по модулю убывает как r в степени минус 7. Равнодействующая является их суммой и обращается в ноль при r0. На той же оси расстояний потенциальная энергия имеет минимум при r0 и стремится к нулю снизу при удалении молекул. Уровни E1 и E2 обозначают полные энергии; r1, r2 и r3 — точки, где потенциальная энергия равна соответствующей полной энергии.</desc>',
        '<defs>',
        '<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="#263747" stroke-width="1.6"/></marker>',
        '<clipPath id="force-clip"><rect x="82" y="180" width="546" height="368"/></clipPath>',
        '<clipPath id="energy-clip"><rect x="82" y="740" width="546" height="355"/></clipPath>',
        '<style>',
        'text{font-family:Arial,Helvetica,sans-serif;fill:#263747}.heading{font-size:27px;font-weight:600}.label{font-size:23px}.small{font-size:22px}.math{font-family:Georgia,"Times New Roman",serif;font-size:27px;font-style:italic}',
        '.axis{fill:none;stroke:#263747;stroke-width:1.8;marker-end:url(#arrow)}.guide{fill:none;stroke:#8997a6;stroke-width:1.3;stroke-dasharray:6 6}.equilibrium{fill:none;stroke:#263747;stroke-width:1.5;stroke-dasharray:5 6}',
        '.repulsion{fill:none;stroke:#b85032;stroke-width:3}.attraction{fill:none;stroke:#087f80;stroke-width:3}.result{fill:none;stroke:#176da3;stroke-width:4}.energy{fill:none;stroke:#754fa8;stroke-width:4}',
        '.level1{stroke:#b85032;stroke-width:1.8;stroke-dasharray:8 6}.level2{stroke:#087f80;stroke-width:1.8;stroke-dasharray:8 6}.leader{fill:none;stroke:#8997a6;stroke-width:1.2}',
        '</style></defs>',
        '<rect width="720" height="1270" rx="12" fill="#fff"/>',
        label(28, 38, 'Сила взаимодействия', 'heading'),
        line(36, 79, 74, 79, 'repulsion'), label(90, 87, 'Отталкивание: +B / r¹³'),
        line(36, 114, 74, 114, 'attraction'), label(90, 122, 'Притяжение: −A / r⁷'),
        line(36, 149, 74, 149, 'result'), label(90, 157, 'Равнодействующая'),
        line(82, 360, 652, 360, 'axis'), line(82, 555, 82, 175, 'axis'),
        label(65, 189, 'F', 'math', 'text-anchor="end"'), label(650, 394, 'r', 'math'),
        label(65, 390, '0', 'small', 'text-anchor="end"'),
        line(r0, 180, r0, 566, 'equilibrium'),
        '<g clip-path="url(#force-clip)">',
        `<path id="repulsion-curve" class="repulsion" d="${sampled(model.repulsion, forceY)}"/>`,
        `<path id="attraction-curve" class="attraction" d="${sampled(model.attraction, forceY)}"/>`,
        `<path id="force-curve" class="result" d="${sampled(model.force, forceY)}"/>`,
        '</g>',
        `<circle id="force-equilibrium" cx="${number(r0)}" cy="360" r="5" fill="#176da3"/>`,
        label(r0, 595, 'r₀', 'math', 'text-anchor="middle"'),
        label(360, 635, 'F > 0 — отталкивание; F < 0 — притяжение', 'small', 'text-anchor="middle"'),
        line(28, 666, 692, 666, 'leader'),
        label(28, 705, 'Потенциальная энергия', 'heading'),
        line(82, 880, 652, 880, 'axis'), line(82, 1100, 82, 735, 'axis'),
        label(65, 748, 'U', 'math', 'text-anchor="end"'), label(650, 914, 'r', 'math'),
        label(65, 910, '0', 'small', 'text-anchor="end"'),
        line(82, energyY(model.energy1), 625, energyY(model.energy1), 'level1'),
        line(82, energyY(model.energy2), 625, energyY(model.energy2), 'level2'),
        label(620, energyY(model.energy1) - 16, 'E₁ > 0', 'math', 'text-anchor="end"'),
        label(620, energyY(model.energy2) - 16, 'E₂ < 0', 'math', 'text-anchor="end"'),
        '<g clip-path="url(#energy-clip)">',
        `<path id="energy-curve" class="energy" d="${sampled(model.potential, energyY)}"/>`,
        '</g>',
        line(r0, 740, r0, 1120, 'equilibrium'),
        line(82, energyY(model.potential(1)), r0, energyY(model.potential(1)), 'guide'),
        `<circle id="energy-equilibrium" cx="${number(r0)}" cy="${number(energyY(model.potential(1)))}" r="5" fill="#754fa8"/>`,
        label(98, 1088, 'Минимум U', 'small'),
        line(210, 1080, r0 - 8, energyY(model.potential(1)) + 8, 'leader')
    ];

    const markers = [
        { r: r1, energy: model.energy1, name: 'r₁', labelX: 240 },
        { r: r2, energy: model.energy2, name: 'r₂', labelX: 281 },
        { r: 1, energy: model.potential(1), name: 'r₀', labelX: 323 },
        { r: r3, energy: model.energy2, name: 'r₃', labelX: 366 }
    ];
    for (const marker of markers) {
        const px = x(marker.r), py = energyY(marker.energy);
        if (marker.r !== 1) {
            parts.push(line(px, py, px, 1120, 'guide'));
            parts.push(`<circle cx="${number(px)}" cy="${number(py)}" r="4" fill="#754fa8"/>`);
        }
        parts.push(line(px, 1120, marker.labelX, 1140, 'leader'));
        parts.push(label(marker.labelX, 1168, marker.name, 'math', 'text-anchor="middle"'));
    }
    parts.push(
        label(360, 1212, 'При r = r₀: F = 0, U имеет минимум.', 'small', 'text-anchor="middle"'),
        label(360, 1247, 'U(∞) = 0; E₁ и E₂ — полные энергии.', 'small', 'text-anchor="middle"'),
        '</svg>'
    );
    return parts.join('\n') + '\n';
}

if (require.main === module) {
    const target = path.join(__dirname, '..', 'images', 'notes', 'physics-10', 'intermolecular-interaction.svg');
    fs.writeFileSync(target, render());
    console.log('Intermolecular diagram generated from the force and potential functions.');
}

module.exports = { model, geometry, x, forceY, energyY, turningPoints, render };
