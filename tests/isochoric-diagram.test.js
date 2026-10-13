'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {render}=require('../tools/generate-isochoric-diagram');const svg=render();
function element(id){const m=svg.match(new RegExp('<[^>]+\\bid="'+id+'"[^>]*>'));assert.ok(m,'Missing diagram feature '+id);const a={};for(const x of m[0].matchAll(/([\w-]+)="([^"]*)"/g))a[x[1]]=x[2];return a;}
const a=element('isochoric-pv-state-1'),b=element('isochoric-pv-state-2');
assert.equal(+a.cx,+b.cx,'Volume must remain constant on p(V)');assert.ok(+b.cy<+a.cy,'Heating must increase pressure');
const c=element('isochoric-vt-state-1'),d=element('isochoric-vt-state-2');
assert.equal(+c.cy,+d.cy,'Volume must remain constant on V(T)');assert.ok(+d.cx>+c.cx,'State 2 must have a greater temperature');
const origin=element('isochoric-pt-axis-x'),s1=element('isochoric-pt-state-1'),s2=element('isochoric-pt-state-2');
const x0=+origin.x1,y0=+origin.y1,slope=s=>(y0-+s.cy)/(+s.cx-x0);
assert.ok(Math.abs(slope(s1)-slope(s2))<1e-9,'p(T) states and the origin must be collinear');assert.ok(slope(s1)>0,'p(T) slope must be positive');
assert.equal((y0-+s2.cy)/(y0-+s1.cy),(+s2.cx-x0)/(+s1.cx-x0),'Pressure and absolute temperature must change in the same ratio');
const extrapolation=element('isochoric-pt-origin');assert.equal(+extrapolation.x1,x0);assert.equal(+extrapolation.y1,y0);assert.equal(+extrapolation.x2,+s1.cx);assert.equal(+extrapolation.y2,+s1.cy);
const fo=element('isochoric-family-axis-x');let previous=Infinity,constant;
for(let i=1;i<=3;i++){const e=element('isochore-'+i),V=+e['data-volume'],k=(+e.y1-+e.y2)/(+e.x2-+e.x1);assert.ok(k>0&&k<previous,'Increasing volume must reduce isochore slope');const intercept=+e.y1+k*(+e.x1-+fo.x1);assert.ok(Math.abs(intercept-+fo.y1)<.002,'Every isochore must extrapolate to the same origin');if(constant===undefined)constant=k*V;else assert.ok(Math.abs(k*V-constant)<.00001,'Isochore slopes must be inversely proportional to volume');previous=k;}
assert.equal(fs.readFileSync(path.join(__dirname,'../images/notes/physics-10/isochoric-coordinate-graphs.svg'),'utf8').replace(/\r\n/g,'\n'),svg);
console.log('Isochoric diagram: constant volume, heating direction, common states, origin and inverse-volume slope ordering passed');
