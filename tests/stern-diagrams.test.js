'use strict';
const assert=require('node:assert/strict');
const {diagrams}=require('../tools/generate-maxwell-note-diagrams');
const source=diagrams['shtern-rotation.svg']();
function element(id){const tag=source.match(new RegExp('<[^>]+\\bid="'+id+'"[^>]*>'));assert.ok(tag,'Missing physical feature '+id);const a={};for(const m of tag[0].matchAll(/([\w-]+)="([^"]*)"/g))a[m[1]]=m[2];return a}
const point=e=>({x:+e.cx,y:+e.cy});
const origin=point(element('stern-top-source')),wall=element('stern-top-outer-cylinder');
const initial=element('stern-top-initial-slit'),current=point(element('stern-top-current-slit'));
const A=point(element('stern-top-reference-mark')),B=point(element('stern-top-impact'));
const r=Math.abs(+initial.x1-origin.x),R=+wall.r;
assert.equal((+initial.y1 + +initial.y2)/2,origin.y,'Original slit marker must be centred on the straight flight ray');
const angle=p=>Math.atan2(p.y-origin.y,p.x-origin.x);
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<.003,message);
close(Math.hypot(current.x-origin.x,current.y-origin.y),r,'Both slit positions must be on the inner cylinder');
close(Math.hypot(A.x-origin.x,A.y-origin.y),R,'Reference mark must be on the receiving wall');
close(Math.hypot(B.x-origin.x,B.y-origin.y),R,'Impact must be on the receiving wall');
close(angle(A),angle(current),'Slit and old reference mark must rotate by the same angle');
close(angle(B),0,'The particle must keep the direction selected by the slit at emission');
const beam=element('stern-top-free-flight');
assert.equal(+beam.y1,origin.y);assert.equal(+beam.y2,origin.y);
assert.ok(+beam.x1>+initial.x1&&+beam.x2<B.x,'The free flight must run outward after the original slit');
assert.ok(angle(current)<0,'The apparatus rotates counterclockwise in the picture');
assert.ok(angle(B)-angle(A)>0,'Relative trace shift must oppose rotation');
function arc(id){const d=element(id).d;const m=d.match(/^M([\d.-]+) ([\d.-]+) A([\d.-]+) ([\d.-]+) 0 (\d) (\d) ([\d.-]+) ([\d.-]+)$/);assert.ok(m,'Expected circular arc '+id);return{start:{x:+m[1],y:+m[2]},end:{x:+m[7],y:+m[8]},sweep:+m[6]}}
const turn=arc('stern-top-rotation'),shift=arc('stern-top-shift'),phi=arc('stern-top-angle');
assert.equal(turn.sweep,0);assert.equal(shift.sweep,1);assert.equal(phi.sweep,1);
close(angle(shift.start),angle(A),'Shift must begin at reference mark angle');close(angle(shift.end),angle(B),'Shift must end at impact angle');
close(angle(phi.start),angle(A),'Measured angle must begin at reference ray');close(angle(phi.end),angle(B),'Measured angle must end at flight ray');
for(const [id,radius]of[['stern-top-radius-r',r],['stern-top-radius-R',R]]){const e=element(id);close(Math.hypot(+e.x2-+e.x1,+e.y2-+e.y1),radius,'Radius dimension must agree with cylinder geometry')}
const apparatus=diagrams['shtern-apparatus.svg']();
const numbers=[...apparatus.matchAll(/<text[^>]+class="number stern-blue"[^>]*>(\d)<\/text>/g)].map(m=>+m[1]);assert.deepEqual(numbers,[1,2,3,4,5,6,7,8],'Every apparatus feature must have one unambiguous label');
console.log('Stern diagrams: straight free flight, common rotation, opposite trace shift, radius dimensions and eight labels passed');
