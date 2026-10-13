'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {diagrams}=require('../tools/generate-maxwell-note-diagrams');
const {render}=require('../tools/generate-gay-lussac-diagram');
function element(svg,id){const tag=svg.match(new RegExp('<[^>]+\\bid="'+id+'"[^>]*>'));assert.ok(tag,'Missing feature '+id);const a={};for(const m of tag[0].matchAll(/([\w-]+)="([^"]*)"/g))a[m[1]]=m[2];return a}
const lam=diagrams['lammert-apparatus.svg'](),chamber=element(lam,'lammert-chamber');
for(const n of [4,5]){const d=element(lam,'lammert-disk-'+n);assert.ok(+d.cx-+d.rx>+chamber.x&&+d.cx + +d.rx<+chamber.x + +chamber.width,'Disk must be enclosed horizontally');assert.ok(+d.cy-+d.ry>+chamber.y&&+d.cy + +d.ry<+chamber.y + +chamber.height,'Disk must lie inside vacuum chamber');}
const a=element(lam,'lammert-slot-4'),b=element(lam,'lammert-slot-5');
assert.equal(+a.x1,+a.x2,'First radial slit must align with the incoming beam');
assert.ok(+b.x2>+b.x1,'Second slit must show the relative angular offset');
const d4=element(lam,'lammert-disk-4'),d5=element(lam,'lammert-disk-5'),sep=element(lam,'lammert-separation');
assert.equal(+sep.x1,+d4.cx);assert.equal(+sep.x2,+d5.cx);
const guide=element(lam,'lammert-flight-direction'),incoming=element(lam,'lammert-incoming-beam');assert.equal(+guide.y1,+incoming.y1);assert.equal(+guide.y2,+incoming.y2,'Selected flight direction must be straight');
const gay=render(),gas=element(gay,'gay-gas-space'),drop=element(gay,'gay-mercury-drop'),tube=element(gay,'gay-bulb-and-capillary');
assert.equal(+gas.d.match(/^M(\d+)/)[1],+drop.x,'Trapped gas must end at the mercury droplet');
assert.ok(+tube.d.match(/^M(\d+)/)[1]>+drop.x + +drop.width,'Tube must continue beyond the droplet to the atmosphere');
assert.ok(!tube.d.endsWith('Z'),'Open tube must have no closing wall at the atmospheric end');
assert.equal(fs.readFileSync(path.join(__dirname,'../images/notes/physics-10/gay-lussac-apparatus.svg'),'utf8').replace(/\r\n/g,'\n'),gay);
console.log('Gas experiment diagrams: enclosed disks, offset slits, straight flight, disk separation and connected gas passage passed');
